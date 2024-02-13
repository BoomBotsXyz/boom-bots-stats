const ethers = require("ethers")
const BN = ethers.BigNumber
const { AddressZero } = ethers.constants
const { getAddress } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const { range, sortBNs, readJsonFile, deduplicateArray } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, s3CopyObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunked, multicallChunkedDict, fetchEvents, findDeployBlock, sortAndDeduplicateEvents } = require("./../utils/network")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")

const ABI_JOINED2 = readJsonFile("./data/abi/other/Joined2.json")

const assetsBucket = 'assets.boombots.xyz'
const statsDataBucket = 'stats.boombots.xyz.data'
const statsCacheBucket = 'stats-cdn.boombots.xyz'
const defaultChainID = 168587773
const defaultVersion = "v0.1.0" // version of the smart contract
const defaultResponseVariant = 0

const ERC20_BALANCE_FETCHER_ADDRESS   = "0x3a45f053C289C352bF354Ed3eA45944F1a4aF910";

const ETH_ADDRESS_EEE            = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ETH_ADDRESS                = "0x0000000000000000000000000000000000000000";
const ALL_CLAIMABLE_GAS_ADDRESS  = "0x0000000000000000000000000000000000000001";
const MAX_CLAIMABLE_GAS_ADDRESS  = "0x0000000000000000000000000000000000000002";
const WETH_ADDRESS               = "0x4200000000000000000000000000000000000023";
const USDB_ADDRESS               = "0x4200000000000000000000000000000000000022";
const USDC_ADDRESS               = "0xF19A5b56b419170Aa2ee49E5c9195F5902D39BF1";
const USDT_ADDRESS               = "0xD8F542D710346DF26F28D6502A48F49fB2cFD19B";
const DAI_ADDRESS                = "0x9C6Fc5bF860A4a012C9De812002dB304AD04F581";
const BOLT_ADDRESS               = "0x1B0cC80F4E2A7d205518A1Bf36de5bED686662FE";
const RGB_ADDRESS                = "0x7647a41596c1Ca0127BaCaa25205b310A0436B4C";

const TOKEN_LIST = [
  ETH_ADDRESS,
  ALL_CLAIMABLE_GAS_ADDRESS,
  MAX_CLAIMABLE_GAS_ADDRESS,
  WETH_ADDRESS,
  USDB_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  DAI_ADDRESS,
  BOLT_ADDRESS,
  RGB_ADDRESS,
]

var balanceFetcherMC = new multicall.Contract(ERC20_BALANCE_FETCHER_ADDRESS, ABI_JOINED2)

async function fetchBotState(chainID=defaultChainID, version=defaultVersion, responseVariant=defaultResponseVariant, focusBotID=undefined) {
  // setup
  //var s3KeyBotlist = `${chainID}/${version}/botlist.json`
  var s3KeyState = `${chainID}/${version}/state.json`
  var s3KeyImgList = `bbot/src_testnet/filenames.json`
  //var s3KeyEvents = `${chainID}/${version}/events.json`
  //var s3KeyTokens = `${chainID}/${version}/tokens.json`
  var state = JSON.parse(await s3GetObjectPromise({ Bucket: statsCacheBucket, Key: s3KeyState }))
  state.chainID = chainID
  // possible early exit
  if(responseVariant == 2 && !!focusBotID && !!state.botlist[focusBotID] && !!state.botlist[focusBotID].botAddress) {
    return state
  }
  var mcProvider = await getMulticallProvider(chainID)
  var provider = mcProvider._provider
  var networkSettings = getNetworkSettings(chainID)
  var latestBlock = (await provider.getBlockNumber()) - networkSettings.confirmations
  state.latestBlock = latestBlock
  var boomBotsNft = new ethers.Contract(state.boomBotsNftAddress, ABI_JOINED2, provider)
  var boomBotsNftMC = new multicall.Contract(state.boomBotsNftAddress, ABI_JOINED2)
  // find deploy block
  if(!state.deployBlock || state.deployBlock <= 0) {
    state.deployBlock = await findDeployBlock(provider, boomBotsNft.address)
    //state.lastScannedBlock = state.deployBlock - 1
  }
  // determine if any nfts were created since the last scan
  var knownBotsLength = Object.keys(state.botlist).length
  var ts = (await boomBotsNft.totalSupply({blockTag: latestBlock})).toNumber();
  if(knownBotsLength > ts) throw new Error("knownBotsLength > totalSupply. should not be possible")
  if(knownBotsLength < ts) {
    // fetch new nfts
    var lowBotID = knownBotsLength+1
    var highBotID = ts
    var fetchBotIDs = []
    var calls = []
    for(var botID = lowBotID; botID <= highBotID; botID++) {
      fetchBotIDs.push(botID)
      calls.push(boomBotsNftMC.getBotInfo(botID))
    }
    var results = await multicallChunked(mcProvider, calls, latestBlock, 200)
    // store data in s3
    var promises = []
    for(var i = 0; i < fetchBotIDs.length; i++) {
      var botID = fetchBotIDs[i]
      var botInfo = results[i]
      var botAddress = botInfo.botAddress
      var implementationAddress = botInfo.implementationAddress
      var srcimg = await pickSrcImg()
      state.botlist[botID] = { botID, botAddress, implementationAddress, srcimg }
      var copyParams = {
        Bucket: assetsBucket,
        CopySource: `${assetsBucket}/bbot/src_testnet/${srcimg}`,
        Key:`bbot/${chainID}/${version}/${botID}.png`,
        Metadata: {
          "Content-Type": "image/png",
          "Cache-Control": "max-age=864000",
        },
        MetadataDirective: "REPLACE",
        CacheControl: "max-age=864000",
        ContentType: "image/png",
      }
      promises.push(s3CopyObjectPromise(copyParams))
      var metadata = createBotMetadata(botID, botAddress)
      promises.push(s3PutObjectPromise({ Bucket: statsDataBucket, Key: `${chainID}/bbot_metadata/${version}/${botID}.json`, Body: JSON.stringify(metadata), ContentType: "application/json" }))
    }
    promises.push(s3PutObjectPromise({ Bucket: statsCacheBucket, Key: s3KeyState, Body: JSON.stringify(state), ContentType: "application/json" }))
    await Promise.all(promises)
  }
  // cleanup
  var fetchBotIDs = []
  for(var botID = 1; botID <= ts; botID++) {
    fetchBotIDs.push(botID)
    state.botlist[botID].srcimg = undefined
  }
  // if the data is being queryied over api
  if(responseVariant == 1) {
    var calls = {}
    for(var i = 0; i < fetchBotIDs.length; i++) {
      var botID = fetchBotIDs[i]
      calls[`ownerOf_${botID}`] = boomBotsNftMC.ownerOf(botID)
    }
    // if also drill in on a bot
    var shouldFocus = !!focusBotID && !!state.botlist[focusBotID] && !!state.botlist[focusBotID].botAddress
    if(shouldFocus) {
      state.botlist[focusBotID].isFocus = true
      state.botlist[focusBotID].balances = {}
      var botAddress = state.botlist[focusBotID].botAddress
      var botMC = new multicall.Contract(botAddress, ABI_JOINED2)
      calls['modules'] = botMC.facets()
      calls['state'] = botMC.state()
      calls[`balances_${botAddress}`] = balanceFetcherMC.fetchBalances(botAddress, TOKEN_LIST)
    }
    // fetch results
    var results = await multicallChunkedDict(mcProvider, calls, latestBlock, 300)
    // parse results
    for(var key of Object.keys(results)) {
      if(key.length > 8 && key.substring(0,8) == 'ownerOf_') {
        var botID = key.substring(8, key.length)
        var owner = results[key]
        state.botlist[botID].owner = owner
      }
      else if(key.length > 9 && key.substring(0,9) == "balances_") {
        state.botlist[focusBotID].balances = processBalances(results[key])
      }
      else if(key == 'modules') {
        state.botlist[focusBotID].modules = processModules(results['modules'])
      }
      else if(key == 'state') {
        state.botlist[focusBotID].state = results['state'].toNumber()
      }
      else {
        //console.log(`unknown key from multicallChunkedDict ${key}`)
      }
    }
  }
  return state


  // helper functions

  function processBalances(amounts) {
    var d = {}
    for(var i = 0; i < TOKEN_LIST.length; i++) {
      var num = processBalance(amounts[i])
      if(!!num) {
        var addr = TOKEN_LIST[i]
        d[addr] = num
        if(addr == ETH_ADDRESS) d[ETH_ADDRESS_EEE] = num // duplicate
      }
    }
    return d
  }

  function processBalance(bn) {
    if(!bn || bn.lte(0) || bn == "0") return undefined
    return bn.toString()
  }

  function processModules(modules) {
    return modules.map(module => {
      return {
        moduleAddress: module.facetAddress,
        functionSelectors: module.functionSelectors
      }
    })
  }

  // pick a source image
  var srcimgs
  async function pickSrcImg() {
    // fetch available from s3
    if(!srcimgs || !srcimgs.length) {
      srcimgs = JSON.parse(await s3GetObjectPromise({ Bucket: assetsBucket, Key: s3KeyImgList }))
    }
    if(!srcimgs || !srcimgs.length) {
      throw new Error("no available srcimgs")
    }
    // pick from available
    var srcimg
    while(true) {
      var index = Math.floor(Math.random() * srcimgs.length)
      srcimg = srcimgs[index]
      // attempt to reduce duplicates
      // reroll if srcimg selected in last 100 bots created
      var lookbackLength = 100
      var prev = Object.values(state.botlist)
      if(prev.length > lookbackLength) {
        prev = prev.slice(prev.length-lookbackLength, prev.length)
      }
      var reroll = prev.some(x => x.srcimg == srcimg)
      if(!reroll) break
    }
    return srcimg
  }

  function createBotMetadata(botID, botAddress) {
    var botIDstr = botID + ""
    var metadata = {
      "description": `This NFT represents the ownership rights to BOOM! Bot #${botID} and its token bound account ${botAddress} on ${networkSettings.chainName||"unknown chain"}. The owner of this NFT can use the bot, modify its configuration, and withdraw its tokens.`,
      //"external_url": `https://analytics.boombots.xyz/#/${networkSettings.chainNameAnalytics}/bots/${botID}`,
      "external_url": `https://app.boombots.xyz/#/bot/?botID=${botID}`,
      "image": `https://assets.boombots.xyz/bbot/${chainID}/${version}/${botID}.png`,
      "name": `BOOM! Bot #${botID}`,
      "attributes": []
    }
    return metadata
  }
}
exports.fetchBotState = fetchBotState
