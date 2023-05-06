import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';
import utils from 'web3-utils';
import * as db from "./db.js";
import axios from 'axios';

export const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'application/json',
};

export const response_data = (data) => {
    return {
        headers,
        statusCode: 200,
        body: JSON.stringify(data, null, 2),
    };
}

export const isValidEthAddress = (ethAddress) => {
    return /^(0x)?[0-9a-f]{40}$/i.test(ethAddress);
}

export const isValidSubstrateAddress = (address) => {
    try {
        encodeAddress(
            isHex(address)
                ? hexToU8a(address)
                : decodeAddress(address)
        );
        return true;
    } catch (error) {
        return false;
    }
};

export const hashCode = (s) => {
    return s.split("").reduce(function(a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
}

// first 4 bytes of keccak-256 hash
// see: https://emn178.github.io/online-tools/keccak_256.html
// balanceOf(address): 70a08231
// ownerOf(uint256): 6352211e
// totalSupply(): 18160ddd
export const methodSignature = (methodSignatureAsString) => utils.keccak256(methodSignatureAsString).slice(0, 10);

/*
see:
- https://docs.soliditylang.org/en/latest/abi-spec.html
- https://www.quicknode.com/docs/ethereum/eth_call
*/
export const ethCall = async (endpoint, contract, method, parameters = [], tag = 'latest') => {
    const params = [
        {
            to: contract,
            data: `${methodSignature(method)}${parameters.map((p) => {
                // utils.padLeft(utils.hexToBytes(address), 32)
                const x = utils.padLeft(p, 64);
                return x.startsWith('0x')
                    ? x.slice(2)
                    : x;
            }).join('')}`
        },
        tag
    ];
    const response = await fetch(
        endpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params
            }),
        }
    );
    const json = await response.json();
    //console.log({ endpoint, contract, method, parameters, tag, params, json });
    return json;
};

export const hasBalance = async (mintType, ethAddress) => {
    const balance = await balanceOf(mintType, ethAddress);
    // console.log("balance:" + JSON.stringify(balance) + ",has:" + !!balance.result);
    if(mintType == "zkreadon") {
        if(balance == 1) {
            return true;
        }
        return false;
    }

    if (balance == null || balance === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        return false;
    }
    return true;
};

export const balanceOf = async (mintType, address) => {
    const mint_meta = await db.getMintMetadata(mintType);
    const is_contract = mint_meta.is_contract;
    const is_customize = mint_meta.is_customize;
    if(!is_contract && !is_customize) {
        // Note: if is whitelist, then the balance of address is zero
        return null;
    }

    if (is_contract) {
        const endpoint = mint_meta.metadata.chain_scan_endpoint;
        const contract = mint_meta.metadata.contract_address;
        const balanceCallName = mint_meta.metadata.balance_call_name;
    
        const call_result = await ethCall(endpoint, contract, balanceCallName, [address]);
        return call_result.result;
    }

    // customize call
    if(mintType != "zkreadon") {
        return null;
    }

    // zkreadon
    const response = await customizeCall(mintType, address);
    console.log(`customize allowlist: ${mintType} addr: ${address}, resp: ${JSON.stringify(response)}`);
    if(response != null) {
        return response["data"]["has_sbt"];
    } else {
        return null;
    }
};

export const tokenIdOf = async (mintType, address) => {
    const mint_meta = await db.getMintMetadata(mintType);
    const is_contract = mint_meta.is_contract;
    const is_customize = mint_meta.is_customize;
    if(!is_contract && !is_customize) {
        // Note: if is whitelist, then the token id of address is zero
        return null;
    }

    if (is_contract) {
        const endpoint = mint_meta.metadata.chain_scan_endpoint;
        const contract = mint_meta.metadata.contract_address;
        const tokenCallName = mint_meta.metadata.token_call_name;
    
        const call_result = await ethCall(endpoint, contract, tokenCallName, [address]);
        return call_result.result;
    }

    // customize call
    if(mintType != "zkreadon") {
        return null;
    }

    // zkreadon
    const response = await customizeCall(mintType, address);
    console.log(`customize tokenIdOf: ${mintType} addr: ${address}, resp: ${JSON.stringify(response)}`);
    if(response != null) {
        return response["data"]["token_id"];
    } else {
        return null;
    }
};

export const customizeCall = async (mintType, address) => {
    const metadata = await db.getMintExtraMetadata(mintType);
    if(metadata == null || metadata == undefined || metadata.request == undefined) {
        return null;
    }
    // TODO: key of different mint type
    const key_string = metadata.keyName;
    var api_key = process.env[key_string];
    if(api_key == undefined) {
        api_key = metadata.keyValue;
    }

    const jsonRequest = JSON.stringify(metadata.request);
    const request = jsonRequest.replace("$KEY$", api_key).replace("$ADDRESS$", address);
    const json_para = JSON.parse(request);
    
    const endpoint = metadata.httpUrl;
    const httpType = metadata.httpType;
    // console.log("request " + request + "to:" + endpoint + "," + mintType + ",address:" + address);

    const json = await axios({
        method: httpType,
        url: endpoint,
        data: json_para
    });
    return json.data;
};
