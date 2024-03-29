// responsible for fetching the metadata of an hpt

const { s3GetObjectPromise, snsPublishError } = require("./../../utils/aws")
const { fetchBotState } = require("./../../state/fetchBotState")
const { verifyParams } = require("./../verifyParams")

// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

async function handle(event) {
  var { chainID, botID, version } = verifyParams(event["queryStringParameters"])
  var s3Key = `${chainID}/bbot_metadata/${version}/${botID}.json`
  // try to get metadata from cache
  try {
    return await s3GetObjectPromise({ Bucket: "stats.boombots.xyz.data", Key: s3Key })
  } catch(e) {}
  // metadata not cached. fetch and cache state
  await fetchBotState(chainID, version)
  // try to get metadata from cache again
  try {
    return await s3GetObjectPromise({ Bucket: "stats.boombots.xyz.data", Key: s3Key })
  } catch(e) {}
  // if not cached, token does not exist
  throw { name: "InputError", stack: `botID ${botID} does not exist on chain ${chainID}` }
}

exports.handler = async function(event) {
  try {
    var res = await handle(event)
    return {
      statusCode: 200,
      headers: headers,
      body: res
    }
  } catch (e) {
    switch(e.name) {
      case "InputError":
        return {
          statusCode: 400,
          headers: headers,
          body: e.stack
        }
        break
      default:
        await snsPublishError(event, e)
        return {
          statusCode: 500,
          headers: headers,
          body: "internal server error"
        }
    }
  }
}
