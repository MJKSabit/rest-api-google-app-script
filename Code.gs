var SHEET_URL = "https://docs.google.com/spreadsheets/d/1t-IQjQCX_kh7_4ccydz9rvQw3RR-eadnblQVykHn6ho/edit";


const EXECUTION_TIME    = 3000
const LOCK_ACQUIRE_TIME = 3*EXECUTION_TIME
const PAGE_SIZE         = 30

const PK_COL = 1
const RESPONSE_CODES = {
  200: 'OK',
  201: 'CREATED',
  400: 'BAD REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT FOUND',
  406: 'NOT ACCEPTABLE',
  503: 'SERVER BUSY'
}
class Response {
  constructor() {
    this.updated  = this.read
    this.deleted  = this.read
  }

  created(data) {
    if (data) {
      this.responseCode = 201
      this.data = data
    } else {
      this.responseCode = 406
      this.data = {
        reason: 'Record not saved, might already have record with that PK or invalid PK'
      }
    }
  }

  notFound(what) {
    this.responseCode = 404
    this.data = {
        reason: `${what||'PK'} not found`
      }
  }

  read(data) {
    if (data) {
      this.responseCode = 200
      this.data = data
    } else {
      this.notFound()
    }
  }

  parameterMissing(requiredParameters) {
    this.responseCode = 400
    this.data = {
      reason: `Missing [${requiredParameters}]`
    }
  }

  unknownAction(action, httpMethod) {
    this.responseCode = 400
    this.data = {
      reason: `Can not handle request-action:"${action}" for http-method:"${httpMethod}""`
    }
  }

  serverBusy() {
    this.responseCode = 503
    this.data = {
      reason: 'Other instance of this API is holding lock that has not been released yet'
    }
  }

  getJSON() {
    const data = {
      success: Math.floor(this.responseCode/100) !== 4,
      responseCode: this.responseCode,
      responseVerbose: RESPONSE_CODES[this.responseCode],
      dataType: this.data.data ? 'iterative' : 'single',
      data: this.data 
    }
    
    if(this.responseCode != 503) {
      SpreadsheetApp.flush()
      LockService.getScriptLock().releaseLock()
    }
    
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON)
  }
}

class Table {
  constructor(tableName) {
    this.sheet            = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(tableName)
    this._calculatedPK    = {}
    this.insertionIndex   = this.indexOf
    this.response         = new Response()
    LockService.getScriptLock().waitLock(LOCK_ACQUIRE_TIME)
  }

  /**
   * Cached List of Headers
   * @return Array of TableHeaders
   */
  headers() {
    return this._headers = this._headers || JSON.parse(PropertiesService.getScriptProperties().getProperty(this.sheet.getName()))
  }

  /**
   * Cached Number of Columns
   * @return Number of columns in the table
   */
  width() {
    return this._width = this._width || this.headers().length
  }

  /**
   * Get Value from Table
   * row, column -> 1 based index
   */
  getValueAt(row, col) {
    return this.sheet.getRange(row, col).getValue()
  }

  /**
   * Get single row of data
   * row -> 1 based index
   */
  getFullRecordAt(row) {
    return this.sheet.getRange(row, PK_COL, 1, this.width()).getValues()[0]
  }

  /**
   * Get single row of data with only columns (+PK)
   * mentioned in the @param filterSet
   */
  getPartialRecordSerialized(row, filterSet) {
    const result = {}
    filterSet = filterSet || new Set([this.headers()[0]])

    for(let i=0; i<this._headers.length; i++)
      if(filterSet.has(this.headers()[i]))
        result[this.headers()[i]] = this.getValueAt(row, i+1)
    
    return result
  }

  /**
   * Set value in table
   * row, column -> 1 based index
   */
  setValueAt(row, col, value) {
    this.sheet.getRange(row, col).setValue(value)
  }

  /**
   * Set single row of data in Table
   * row -> 1 based index
   */
  setRecordAt(row, record) {
    this.sheet.getRange(row, 1, 1, this.width()).setValues([record])
  }

  /**
   * @return true if Primary Key exists in Table
   * @use Cached PK index
   */
  hasPrimaryKey(pk) {
    this._calculatedPK[pk] = this._calculatedPK[pk] || this.lowerBound(pk)
    return this.getValueAt(this._calculatedPK[pk], PK_COL) === pk
  }

  /**
   * @return index of PK in table, make sure the table "hasPrimaryKey"
   * @use Cached PK index 
   */
  indexOf(pk) {
    return this._calculatedPK[pk] || this.lowerBound(pk)
  }

  /**
   * @return row_no of the lowerBound
   * cache the result
   * EG. row_no is 1 based
   */
  lowerBound(pk) {
    let
      lo = 1,
      hi = this.sheet.getLastRow() + 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.getValueAt(mid, PK_COL) < pk)
        lo = mid + 1;
      else
        hi = mid;
    }

    this._calculatedPK[pk] = lo
    return lo;
  }

  /**
   * Serializes a row of value with header
   * as Key: Value pair (JS Object)
   */
  serializeRecord(record) {
    const result = {}
    this.headers().forEach((value, index) => {
      result[value] = record[index]
    })
    return result
  }

  /**
   * READ of CRUD
   * @param pk              PRIMARY_KEY to get record, undefined for reading all record, unmatched 404
   * @param filteredColumn  Only return data from these columns, undefined for all columns
   * @param offset          Start iteration for ALL_RECORD, undefined for searching from the top
   * 
   * EG:  Reading all record can take much longer time, so to avoid that 
   *      we search only for EXECUTION_TIME
   * 
   * @return in response.data with response details
   */
  Read(pk, filteredColumn, offset) {

    if (filteredColumn) {
      filteredColumn = new Set(filteredColumn)
      filteredColumn.add(this.headers()[0])
    }

    if (pk && this.hasPrimaryKey(pk)) {
      const row = this.indexOf(pk)
      if (filteredColumn)
        var data = this.getPartialRecordSerialized(row, filteredColumn)
      else
        var data = this.serializeRecord(this.getFullRecordAt(row))
    } else if(pk === undefined) {
      let lookupIndex = offset || 1
      const NUMBER_OF_ROWS = this.sheet.getLastRow()

      var data = {
        data: []
      }

      for(let END_TIME    = new Date().getTime(), 
              START_TIME  = new Date().getTime();
          END_TIME-START_TIME < EXECUTION_TIME &&
          data.data.length    < PAGE_SIZE; 
              END_TIME    = new Date().getTime(),
              ++lookupIndex)
      {
          if (lookupIndex>NUMBER_OF_ROWS)
            break
          
          const record =  filteredColumn ? 
                          this.getPartialRecordSerialized(lookupIndex, filteredColumn) :
                          this.serializeRecord(this.getFullRecordAt(lookupIndex))
          
          data.data.push(record)
      }

      data.hasNext  = !(lookupIndex>NUMBER_OF_ROWS)
      data.next     = lookupIndex
    }

    this.response.read(data)
    return this.response.getJSON()
  }

  /**
   * Searches for @param query words in @param colum (PK if not specified)
   * @param filteredColumn  Only return data from these columns, undefined for all columns
   * @param offset          Start iteration for ALL_RECORD, undefined for searching from the top
   * 
   * EG:  Reading all record can take much longer time, so to avoid that 
   *      we search only for EXECUTION_TIME
   * 
   * @return in response.data with response details (matched query)
   */
  Search(query, column, filteredColumn, offset) {
    // Required PARAMETER
    if(query === undefined) {
      this.response.parameterMissing('q')
      return this.response.getJSON()
    }

    if(column===undefined || this.headers().indexOf(column)==-1) {
      this.response.parameterMissing('column')
      return this.response.getJSON()
    }

    const NUMBER_OF_ROWS = this.sheet.getLastRow()

    // Optional PARAMETER
    column            = column || this.headers()[0]
    const colmunIndex = this.headers().indexOf(column) + 1
    const queryWords  = query.toLowerCase().split(/[^\w\d]+/).sort()
    let lookupIndex   = offset || 1
    if (filteredColumn) {
      filteredColumn = new Set(filteredColumn)
      filteredColumn.add(this.headers()[0])
    }

    var data = {
      data: []
    }

    for(let END_TIME    = new Date().getTime(), 
            START_TIME  = new Date().getTime();
        END_TIME-START_TIME < EXECUTION_TIME &&
        data.data.length    < PAGE_SIZE; 
            END_TIME    = new Date().getTime(),
            ++lookupIndex)
    {
        if (lookupIndex>NUMBER_OF_ROWS)
          break

        const words = this.getValueAt(lookupIndex, colmunIndex).toLowerCase().split(/[^\w\d]+/).sort()
        let i=0, j=0;
        for(; i<queryWords.length && j<words.length &&
              queryWords.length-i<=words.length-j; j++) {
          if(words[j].includes(queryWords[i])) i++;
        } 
        
        if(i === queryWords.length) {
          const record =  filteredColumn ? 
                          this.getPartialRecordSerialized(lookupIndex, filteredColumn) :
                          this.serializeRecord(this.getFullRecordAt(lookupIndex))
          data.data.push(record)
        }
    }

    data.hasNext  = !(lookupIndex>NUMBER_OF_ROWS)
    data.next     = lookupIndex

    this.response.read(data)
    return this.response.getJSON()
  }

  ColumnMatch(column, value, offset) {
    // Required Parameter
    if (column===undefined) {
      this.response.parameterMissing('column')
      return this.response.getJSON()
    }

    const NUMBER_OF_ROWS = this.sheet.getLastRow()
    let lookupIndex   = offset || 1

    const colmunIndex = this.headers().indexOf(column) + 1
    if(colmunIndex) {
      var data = {
        data: []
      }

      for(let END_TIME    = new Date().getTime(), 
              START_TIME  = new Date().getTime();
          END_TIME-START_TIME < EXECUTION_TIME &&
          data.data.length    < PAGE_SIZE; 
              END_TIME    = new Date().getTime(),
              ++lookupIndex)
      {
          if (lookupIndex>NUMBER_OF_ROWS)
            break

          if(this.getValueAt(lookupIndex, colmunIndex) === value) {
            const record =  this.getPartialRecordSerialized(lookupIndex)
            data.data.push(record)
          }
      }

      data.hasNext  = !(lookupIndex>NUMBER_OF_ROWS)
      data.next     = lookupIndex

    }

    this.response.read(data)
    return this.response.getJSON()
  }

  /**
   * Inserts new record to the table
   * if any field is undefined, then default is set to ''
   */
  Create(insertRecord) {
    // Required PARAMETER
    if(insertRecord === undefined) {
      this.response.parameterMissing('POST-DATA')
      return this.response.getJSON()
    }

    const PK_HEADING = this.headers()[0]

    if(insertRecord[PK_HEADING] && !this.hasPrimaryKey(insertRecord[PK_HEADING])) {
      const record = []
      this.headers().forEach( (value) => {
        record.push(insertRecord[value] || '')
      })

      const insertRow = this.insertionIndex(insertRecord[PK_HEADING])
      this.sheet.insertRowBefore(insertRow)
      this.setRecordAt(insertRow, record)

      var data = this.serializeRecord(record)
      this._calculatedPK = {}
    } 
    
    this.response.created(data)
    return this.response.getJSON()
  }

  /**
   * Update record with PK
   * Only the values given in @param updatedData is used
   * If PK is given in @param updatedData, it is ignored
   */
  Update(pk, updatedData) {
    // Required Parameter
    if (pk===undefined) {
      this.response.parameterMissing('pk')
      return this.response.getJSON()
    }

    if(this.hasPrimaryKey(pk)) {
      const row = this.indexOf(pk)
      updatedData[this.headers()[0]] = pk

      for (let i=1; i<this.width(); i++) {
        if (updatedData[this._headers[i]])
          this.setValueAt(row, i+1, updatedData[this._headers[i]])
        else
          updatedData[this._headers[i]] = this.getValueAt(row, i+1)
      }

      var data = updatedData
    }

    this.response.updated(data)
    return this.response.getJSON()
  }

  /**
   * Delete record with PK
   * If record does not exist, Error 404
   */
  Delete(pk) {
    // Required Parameter
    if (pk===undefined) {
      this.response.parameterMissing('pk')
      return this.response.getJSON()
    }

    if(this.hasPrimaryKey(pk)) {
      const row = this.indexOf(pk)
      var data = this.serializeRecord(this.getFullRecordAt(row))
      this.sheet.deleteRow(row)
      this._calculatedPK = {}
    }

    this.response.updated(data)
    return this.response.getJSON()
  }
}

/* 
 * POST Requests
 */
function doPost(request) {
  var action          = request.parameter.action;
  var tableSheetName  = request.parameter.table;

  try {
    var table = new Table(tableSheetName)
  } catch (e) {
    const response = new Response()
    response.serverBusy()
    return response.getJSON()
  }
  
  // Required PARAMETER
  if (!table.sheet || !action) {
    const response = new Response()
    
    if (!action) 
      response.parameterMissing('action')
    else if (!tableSheetName)
      response.parameterMissing('table')
    else
      response.notFound(`Table=${tableSheetName}`)
    return response.getJSON()
  }

  if (request.parameter.pk)
    var pk = request.parameter.pk
  if (request.postData)
    var postData = JSON.parse(request.postData.contents)

  switch (action) {
    case "create":
      return table.Create(postData)
    case "update":
      return table.Update(pk, postData)
    default:
      const response = new Response()
      response.unknownAction(action, 'POST')
      return response.getJSON();
  }
}

/* 
 * GET Requests
 */
function doGet(request) {
  var action          = request.parameter.action;
  var tableSheetName  = request.parameter.table;
  
  try {
    var table = new Table(tableSheetName)
  } catch (e) {
    const response = new Response()
    response.serverBusy()
    return response.getJSON()
  }
  
  // Required PARAMETER
  if (!table.sheet || !action) {
    const response = new Response()
    
    if (!action) 
      response.parameterMissing('action')
    else if (!tableSheetName)
      response.parameterMissing('table')
    else
      response.notFound(`Table=${tableSheetName}`)
    return response.getJSON()
  }

  if (request.parameter.filter)
    var filteredColumn = JSON.parse(request.parameter.filter)
  if (request.parameter.offset)
    var offset = Number.parseInt(request.parameter.offset)
  if (request.parameter.pk)
    var pk = request.parameter.pk
  if (request.parameter.q)
    var query = request.parameter.q
  if (request.parameter.column)
    var column = request.parameter.column
  if (request.parameter.value)
    var value = request.parameter.value

  switch (action) {
    case "read":
      return table.Read(pk, filteredColumn, offset)
    case "delete":
      return table.Delete(pk)
    case "search":
      return table.Search(query, column, filteredColumn)
    case "match":
      return table.ColumnMatch(column, value, offset)
    default:
      const response = new Response()
      response.unknownAction(action, 'GET')
      return response.getJSON();
  }
}


function setUp() {

  PropertiesService.getScriptProperties().deleteAllProperties()

  const META = [
    {
      name: 'user',
      columns: ['username', 'email', 'password', 'image']
    },
    {
      name: 'transaction',
      columns: ['id', 'time', 'from', 'to', 'amount']
    }
  ]

  const db = SpreadsheetApp.openByUrl(SHEET_URL)

  META.forEach((table,index) => {
    PropertiesService.getScriptProperties().setProperty(table.name, JSON.stringify(table.columns))
    if(!db.getSheetByName(table.name)) {
      const sheet = db.insertSheet(table.name)
    }
  })

  // MANUALLY DELETE IRRELEVANT SHEET, ROWS, COLUMNS

  Logger.log(PropertiesService.getScriptProperties().getProperties())
}
