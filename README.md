

# CRUD API with Google App Script and Google Sheets

Build simple CRUD (Create-Read-Update-Delete) API within minutes. This API is **almost** RESTful. The word "almost" is there because we can not really control the response headers, response code and more importantly Google App Script only supports GET and POST methods. So, we are limited to "almost". 

## Why you should use this?

- If you are developing a personal app / API end point, there is no need to use some paid services to deploy app or store database

- You are just creating a API for Hackathon within a short time and there will be only one instance running

- You are creating a API for a small group of people where super fast API is not needed

## When you shoudn't use this?

- In Production obviously

- Data heavy app and where speed matters


## Steps

Youtube Video Tutorial : [https://youtu.be/8U-QaJ0dDS0](https://youtu.be/8U-QaJ0dDS0)

- [ ] Go to [Apps Script](https://script.google.com/home) and create a \[ New Project ] 

  ![](https://i.postimg.cc/2ynG1V5g/image.png)

  

- [ ] Copy `Code.gs` and paste to your `Code.gs`
  

  ![](https://i.postimg.cc/8CFhFjKw/image.png)

  

- [ ] Create a new Spreadsheet in [Google Sheets](https://docs.google.com/spreadsheets/u/0/) and copy its URL from browser.

  ![](https://i.postimg.cc/cLtHwwWK/image.png)

  

- [ ] Set `SHEET_URL` in your `Code.gs` to the link you copied

  ![](https://i.postimg.cc/8CBTmb0C/image.png)

  

- [ ] Go to bottom to the `function setUp()` and edit the `META` with your desired table structure. `META` is an array of Objects, Each object containing `name` of the table and `columns` : array of column names.

  ![](https://i.postimg.cc/Xv3bqCY6/image.png)

  **FIRST ROW MUST BE UNIQUE and will be used as PRIMARY KEY (PK)**

  

- [ ] Save the project, select `setUp` from the drop down and \[ Run ]. You will see the META in the console. (You might be promoted to allow the script to access your spreadsheets, select **Proceed Anyway**)

  ![](https://i.postimg.cc/wjzqyPwr/image.png)

  

- [ ] Go to \[ Deploy ] > **New Deployment** > 

  *Type*: **Web App**
  *Description*: As you wish
  *Execute as*: Me
  *Who has access*: **Anyone**

  

  ![](https://i.postimg.cc/4xWDfFqV/image.png)

  

- [ ] Copy the Web App Link, this is your API Link, You can use this link in Postman to test your API

  ![](https://i.postimg.cc/6qKjLdFB/image.png)

  

## API Actions

![](https://i.postimg.cc/sx2Srxhp/image.png)

As a CRUD API, you must be able to do Create - Update - Delete - Read from the database.  You will get some more features than that in this API

All actions include a **query parameter** "*table*" with the name of the table you want these actions to be applied

### create - POST

URL: `<API>?action=create&table=users`

POST-BODY: `<JSON Key-Value Record (one row)>`, Example:

```json
{
    "username": "1681819",
    "email": "craincin1@google.pl",
    "password": "Corette Raincin",
    "image": "Junior"
}
```

**NOTE: PrimaryKey (PK) must be unique, if not record is not created, showing error**

If any value is not provided, it is set to empty string ("") by default.

![](https://i.postimg.cc/BQKb124j/image.png)

Response with the newly created record or error if any

### update - POST

URL: `<API>?action=update&table=users&pk=1681819`

POST-BODY: `<JSON Key-Value Record (one row)>` , Example: (`pk['username']` not needed here)

```json
{
    "username": "1681819",
    "email": "craincin1@google.com.bd"
}
```

![](https://i.postimg.cc/529tKT8C/image.png)

Update the **only** provided values of the record (finding with pk), if you want to change the pk you must delete and then insert. **UPDATE can not change PK**

### delete - GET

URL: `<API>?action=update&table=users&pk=1681819`

Deletes the record and send it as response if possible, else error is given in response

![](https://i.postimg.cc/CMtHgCc5/image.png)

### read - GET

URL: `<API>?action=update&table=users`

Reads **ALL** records (iterative) and send them if `pk` is not provided. With `pk`, only a single record is sent in response

WARNING: READ ALL won't be consistent when there is INSERT/DELETE in the table.

**Additional Query Parameters**

```
pk		: primary key (unique cell value of the first column)
offset	: Start of reading OFFSET for READ_ALL iteration
filter	: JSON Array, Only send the provided column values in the response
```

![](https://i.postimg.cc/wxV84v2w/image.png)

![](https://i.postimg.cc/fL8CX67f/image.png)



**search** and **match** has linear `O(N)` complexity whereas **read** has logarithmic `O(lgN)` complexity. Try to avoid them if possible.

### search - GET

URL: `<API>?action=update&table=users&column=email&q=gmail`

Searches **Word-by-Word** query parameter `q` with all the values of given `column`

* Pagination is done via `EXECUTION_TIME`, No hard limit

  Optional Query Parameter: `filter` to get desired row data only

![](https://i.postimg.cc/D0FWvZ4C/image.png)

### match - GET

URL: `<API>?action=update&table=users&column=email&value=craincin1@google.com.bd`

Reverse **PrimaryKey** finder that ***match***es `value` exactly with the given `column`

![](https://i.postimg.cc/pdzXmvH3/image.png)

## Response

Every response has `success : Boolean`, `responseCode : Integer`, `responseVerbose : String`, `dataType : 'single' | 'iterative'` and `data: JSONObject` in JSON Formant.

If the request is successfully executed, then `success` is true, false otherwise.`responseCode` and `responseVerbose` contains more details about the response. For an unsuccessful response, `data.reason` contains specific info for that unsuccessful request.

For `dataType = 'single' `, the `data` element contains a single record (that has been requested to READ, CREATE, UPDATE, DELETE or others)

For `dataType = 'iterative' `, the `data` element is like a stream with `hasNext: Boolean` and `next: Integer` - offset for next query. `data.data : Array` contains currently fetched data. [*They can be inconsistent due to Creation or Deletion of Records*]

## More Configuration

```js
const EXECUTION_TIME    = 3000              // MAXIMUM TIME GET STREAM ITERABLE DATA
const LOCK_ACQUIRE_TIME = 3*EXECUTION_TIME  // WAITING TIME FOR OTHER INSTANCE TO STOP
const PAGE_SIZE         = 30                // PAGINATION
```

## Inspired By

[Google App Script CRUD](https://gist.github.com/richardblondet/ce87a397ef669d4d25dd21ea02b9dda1)
