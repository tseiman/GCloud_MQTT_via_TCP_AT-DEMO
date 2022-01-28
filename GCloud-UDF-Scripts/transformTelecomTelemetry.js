/**
 * GCloud UDF Script - to be part of a Data Flow Job
 * Mobile telemetry job fuction adding the Cloud's timestamp and converts the edgedate from epoch milliseconds into timestamp string
 * TS, 2022
 * @param {string} inJson
 * @return {string} outJson
 */
function transform(inJson) {
  var obj = JSON.parse(inJson);


  var date = new Date(obj.edgedate);
  var now = new Date();
  obj.edgedate = date.toISOString();
  obj.date = now.toISOString();

  return JSON.stringify(obj);

}