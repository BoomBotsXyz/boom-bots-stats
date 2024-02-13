const ethers = require("ethers")
const BN = ethers.BigNumber
const { getNetworkSettings } = require("./../utils/getNetworkSettings")

function verifyChainID(params) {
  var chainID = params["chainid"] || params["chainId"] || params["chainID"]
  if(!chainID) throw { name: "InputError", stack: 'chainID not given' }
  try {
    var chainID2 = parseInt(chainID)
    getNetworkSettings(chainID2)
    return chainID2
  } catch(e) {
    throw { name: "InputError", stack: `chainID '${chainID}' not supported` }
  }
}

function verifyBotID(params) {
  // only checks if the botID may be valid
  // does not check if the botID exists
  var botID = params["botid"] || params["botId"] || params["botID"]
  if(!botID) throw { name: "InputError", stack: 'botID not given' }
  try {
    var botID2 = BN.from(botID)
    if(botID2.lte(0)) throw ""
    botID2 = botID2.toString()
    return botID2
  } catch(e) {
    throw { name: "InputError", stack: `botID '${botID}' invalid`}
  }
}

function verifyVersion(params) {
  var defaultVersion = "v0.1.0"
  var allowedVersions = {
    "v0.1.0": true,
  }
  var versionRemap = {
    "0.1.0": "v0.1.0",
    "V0.1.0": "v0.1.0",
    "010": "v0.1.0",
    "V010": "v0.1.0",
  }
  var version = params["v"] || params["version"]
  version = versionRemap[version] || version
  if(!version) return defaultVersion
  if(!allowedVersions[version]) {
    throw { name: "InputError", stack: `version '${version}' not supported`}
  }
  return version
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  var botID = verifyBotID(params)
  var version = verifyVersion(params)
  return { chainID, botID, version }
}
exports.verifyParams = verifyParams
