const { s3GetObjectPromise, snsPublishError } = require("./utils/aws")

// Define headers
const headers = {
  "Content-Type": "text/html",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

const defaultstr = `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>BOOM Bots Stats</title></head><body><h3>Docs coming soon</h3></body></html>`
async function getIndexFile() {
  try {
    return await s3GetObjectPromise({ Bucket: 'stats.boombots.xyz.data', Key: 'index.html' })
  } catch(e) {
    return defaultstr
  }
}

// Lambda handler
exports.handler = async function(event) {
  try {
    var res = await getIndexFile()
    return {
      statusCode: 200,
      headers: headers,
      body: res
    }
  } catch (e) {
    await snsPublishError(event, e)
    return {
      statusCode: 500,
      headers: headers,
      body: "internal server error"
    }
  }
}
