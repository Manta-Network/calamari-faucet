import * as config from "./config.js";
import {ApiPromise, WsProvider} from "@polkadot/api";
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as action from "./action.js";

export const shortlist = async (event) => {
    const payload = JSON.parse(event.body);
    const ethAddress = payload.shortlist.toLowerCase(); // only one address
    const token_type = payload.token_type == undefined ? "BAB": payload.token_type;
    const mintType = token_type === "zkBAB" ? "BAB" : token_type.toLowerCase();

    const isValidEthAddress = !!util.isValidEthAddress(ethAddress);
    const hasDbPrior = isValidEthAddress ? (await db.hasPriorAllowlist(mintType, ethAddress)) : false;
    const hasBalance = isValidEthAddress ? (await util.hasBalance(mintType, ethAddress)) : false;
    console.log(`[shortlist query] ${mintType}:${ethAddress},prior:${hasDbPrior},balance:${hasBalance}`);

    let status = "";
    if (!isValidEthAddress) {
        if (mintType === "BAB") {
            status = 'invalid-babt-address';
        } else {
            status = 'invalid-eth-address';
        }
    } else if (!hasBalance) {
        status = 'zero-balance-observed';
    } else if (hasDbPrior) {
        status = 'prior-allow-observed';
    } else {
        const identity = (!!event.requestContext) ? event.requestContext.identity : undefined;
        const endpoint = config.get_endpoint();
        const provider = new WsProvider(endpoint);
        const api = await ApiPromise.create({ provider, noInitWarn: true });
        await Promise.all([ api.isReady, cryptoWaitReady() ]);

        const tx_flag = await action.allowlistNow(api, mintType, ethAddress, identity);
        if (tx_flag === true) {
            status = 'allow-success';
        } else {
            status = 'allow-fail';
        }
    }

    let token = 0;
    if(status === 'allow-success' || status === 'prior-allow-observed') {
        const tokenId = await util.tokenIdOf(mintType, ethAddress);
        token = tokenId.result;
        console.log(`[shortlist result] ${mintType}:${ethAddress},token:${token},status:${status}`);
    }

    return {
        headers: util.headers,
        statusCode: 200,
        body: JSON.stringify({
            status,
            token
        }, null, 2),
    };
};
