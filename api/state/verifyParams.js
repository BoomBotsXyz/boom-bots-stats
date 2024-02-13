const ethers = require("ethers")
const BN = ethers.BigNumber
const { getAddress } = ethers.utils
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

function verifyFocusBotID(params) {
  var focusBotID = params["focusBotID"]
  if(!focusBotID) return undefined
  return focusBotID
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  //if(!params) params = {}
  var chainID = verifyChainID(params)
  var version = verifyVersion(params)
  var focusBotID = verifyFocusBotID(params)
  return { chainID, version, focusBotID }
}
exports.verifyParams = verifyParams
