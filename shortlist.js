import * as config from "./config.js";
import {ApiPromise, WsProvider} from "@polkadot/api";
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as action from "./action.js";

var api;

export const shortlist = async (event) => {
    const payload = JSON.parse(event.body);
    const ethAddress = payload.shortlist.toLowerCase(); // only one address
    const token_type = payload.token_type == undefined ? "BAB": payload.token_type;
    const mintType = token_type === "zkBAB" || token_type === "BAB" ? "BAB" : token_type.toLowerCase();

    const mintMetadata = await db.getMintMetadata(mintType);
    if(mintMetadata == null) {
        console.log(`mintType: ${mintType} haven't metadata set, plz contact admin`);
        return util.response_data({
            status: 'allow-fail',
            msg: `Mint ${mintType} is not allowed.`
        });
    }
    // console.log(`mint metadata of:${mintType}: ${JSON.stringify(mintMetadata)}`);
    const is_contract = mintMetadata.is_contract;
    const is_whitelist = mintMetadata.is_whitelist;
    const is_customize = mintMetadata.is_customize;
    const mint_id = mintMetadata.mint_id;
    const metadata_tokenType = mintMetadata.token_type;
    if(metadata_tokenType != mintType) {
        return util.response_data({
            status: 'allow-fail',
            msg: `Mint ${mintType} is not matched.`
        });
    }

    let status = "";
    let token = "0x00";
    let addressHasBalance = false;

    const isValidEthAddress = !!util.isValidEthAddress(ethAddress);
    if (!isValidEthAddress) {
        if (mintType === "BAB") {
            status = 'invalid-babt-address';
        } else {
            status = 'invalid-eth-address';
        }
        return util.response_data({status,token});
    }

    const getDbPrior = await db.getOnePriorAllowlist(mintType, ethAddress);
    const hasDbPrior = isValidEthAddress ? (getDbPrior.length > 0) : false;
    console.log(`[shortlist] ${mintType}: ${ethAddress}, query prior:${hasDbPrior}, isContract:${is_contract}, isWhitelist:${is_whitelist}, isCustomize:${is_customize}, mintId:${mint_id}`);

    if(hasDbPrior) {
        // The whitelist process is first insert user's address into database
        // but not insert into on-chain storage. so in this case, only user request
        // this api, then the address will be insert into on-chain storage.
        if (is_whitelist) {
            // whitelist, token default is "0x00"
            await onchainAction(event, mintType, mint_id, ethAddress, token);
        } else if(getDbPrior.length > 0) {
            // none-whitelist case normally has this `allowlist` array, because it's insert after onchain action.
            const tokenId = getDbPrior[0]["allowlist"][0]["token_id"];
            if(tokenId != undefined) {
                token = tokenId;
            }
        }
        status = 'prior-allow-observed';
        return util.response_data({status,token});
    }

    // Not in db if is whitelist case, then user don't allow to mint.
    if (is_whitelist) {
        status = 'zero-balance-observed';
        return util.response_data({status,token});
    } 

    // Not in db cases...
    if(is_contract) {
        const endpoint = mintMetadata.metadata.chain_scan_endpoint;
        const contract = mintMetadata.metadata.contract_address;
        const balanceCallName = mintMetadata.metadata.balance_call_name;    
        const call_result = await util.ethCall(endpoint, contract, balanceCallName, [ethAddress]);
        const balance = call_result.result;
        if (balance != null && balance !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            addressHasBalance = true;
        }
    }
    if(is_customize) {
        const response = await util.customizeCall(mintType, ethAddress);
        if(response != null) {
            // mintType = zkreadon
            const balance = response["data"]["has_sbt"];
            if(balance == 1) {
                addressHasBalance = true;
            }
            token = response["data"]["token_id"];
        }
    }

    // validate if the address has balance
    // Not in db, not have balance, not allow to mint.
    if (!addressHasBalance) {
        status = 'zero-balance-observed';
        return util.response_data({status,token});
    }

    // Not in db, but have balance
    if(is_contract) {
        const endpoint = mintMetadata.metadata.chain_scan_endpoint;
        const contract = mintMetadata.metadata.contract_address;
        const tokenCallName = mintMetadata.metadata.token_call_name;

        const call_result2 = await util.ethCall(endpoint, contract, tokenCallName, [ethAddress]);
        token = call_result2.result;
    }

    status = await onchainAction(event, mintType, mint_id, ethAddress, token);
    console.log(`[shortlist] ${mintType}: ${ethAddress}, status:${status},token:${token}`);

    return util.response_data({status,token});
};

export const onchainAction = async(event, mintType, mintId, ethAddress, tokenId) => {
    let status = "";
    const identity = (!!event.requestContext) ? event.requestContext.identity : undefined;

    // const endpoint = config.get_endpoint();
    // const provider = new WsProvider(endpoint);
    // const api = await ApiPromise.create({ provider, noInitWarn: true });
    // await Promise.all([ api.isReady, cryptoWaitReady() ]);
    // console.log("connected api.")

    const api = await global_api();
    console.log(new Date() + " connected api..")

    const tx_flag = await action.allowlistNow(api, mintType, mintId, ethAddress, tokenId, identity);
    if (tx_flag === true) {
        status = 'allow-success';
    } else {
        status = 'allow-fail';
    }
    return status;
}

export const global_api = async() => {
  if(api != undefined) {
    return api;
  }
  const endpoint = config.get_endpoint();
  const provider = new WsProvider(endpoint);
  api = await ApiPromise.create({ provider, noInitWarn: true });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);

  console.log(new Date() + " connected a new api.")

  return api;
}