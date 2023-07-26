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
    return s.split("").reduce(function (a, b) {
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

export const customizeCall = async (metadata, mintType, address) => {
    if (metadata == null || metadata == undefined || metadata.request == undefined) {
        return null;
    }
    // TODO: key of different mint type
    const key_string = metadata.keyName;
    var api_key = process.env[key_string];
    if (api_key == undefined) {
        api_key = metadata.keyValue;
    }

    const jsonRequest = JSON.stringify(metadata.request);
    const request = jsonRequest.replace("$KEY$", api_key).replace("$ADDRESS$", address);
    const json_para = JSON.parse(request);

    const endpoint = metadata.httpUrl;
    const httpType = metadata.httpType;

    const json = await axios({
        method: httpType,
        url: endpoint,
        data: json_para
    });
    return json.data;
};

// https://assets-api.ultiverse.io/api/v1/holder/state?address=0xef1168293649dc1a31f264f5ba7f88b8c0894db4
export const customizGetCall = async (metadata, mintType, address) => {
    if (metadata == null || metadata == undefined) {
        return null;
    }
    const endpoint = metadata.httpUrl;

    const result = await axios.get(endpoint, {
        params: {address}
    });
    return result.data;
};

export const cyberConnectGraphqlQueryProfile = async (metadata, address) => {
    const endpoint = metadata.httpUrl;
    const httpType = metadata.httpType;
    const api_key = metadata["X-API-KEY"];

    const requestConfig = {
        headers: {
            'Content-Type': 'application/json',
            "X-API-KEY": api_key,
        }
    };
    const json = await axios({
        method: httpType,
        url: endpoint,
        requestConfig,
        data: {
            query: `
                query getProfileByAddress($address: AddressEVM!) {
                    address(address: $address) {
                    wallet {
                        profiles {
                        edges {
                            node {
                            profileID
                            handle
                            }
                        }
                        }
                    }
                    }
                }
            `,
            variables: {
                // Make sure this is string type as int might cause overflow
                address
            },
        }
    });
    return json.data;
}

export const cyberConnectGraphqlQueryEssences = async (metadata, address) => {
    const endpoint = metadata.httpUrl;
    const httpType = metadata.httpType;
    const api_key = metadata["X-API-KEY"];
    return await cyberConnectGraphqlQueryEssencesByCursor(endpoint, httpType, api_key, address);
}

export const cyberConnectGraphqlQueryEssencesByCursor = async (endpoint, httpType, api_key, address, cursor = undefined, count = 0) => {
    const requestConfig = {
        headers: {
            'Content-Type': 'application/json',
            "X-API-KEY": api_key,
        }
    };
    let axiosRes;
    if(cursor == undefined) {
        axiosRes = await axios({
            method: httpType,
            url: endpoint,
            requestConfig,
            data: {
                query: `
                    query getCollectedEssencesByAddressEVM($address: AddressEVM!){
                        address(address: $address) {
                            wallet {
                                collectedEssences{
                                    totalCount    
                                    edges{
                                        node{
                                            tokenID
                                            essence{
                                                essenceID
                                                name
                                            }
                                        }
                                        cursor
                                    }
                                    pageInfo {
                                        endCursor
                                        hasNextPage
                                    }
                                }
                            }
                        }
                    }
                `,
                variables: {
                    // Make sure this is string type as int might cause overflow
                    address
                },
            }
        });
    } else {
        axiosRes = await axios({
            method: httpType,
            url: endpoint,
            requestConfig,
            data: {
                query: `
                    query getCollectedEssencesByAddressEVM($address: AddressEVM!){
                        address(address: $address) {
                            wallet {
                                collectedEssences(first: 10, after: "${cursor}"){
                                    totalCount    
                                    edges{
                                        node{
                                            tokenID
                                            essence{
                                                essenceID
                                                name
                                            }
                                        }
                                        cursor
                                    }
                                    pageInfo {
                                        endCursor
                                        hasNextPage
                                    }
                                }
                            }
                        }
                    }
                `,
                variables: {
                    // Make sure this is string type as int might cause overflow
                    address
                },
            }
        });    
    }
    let response = axiosRes.data;
    const collected = response.data.address.wallet.collectedEssences;
    const endCoursor = collected.pageInfo.endCursor;
    const hasNext = collected.pageInfo.hasNextPage;
    const currentEdges = collected.edges;

    if(currentEdges != undefined && currentEdges.length > 0) {
        const W3STs = currentEdges.filter(edge => edge.node?.essence?.name === "Web3 Status Token");
        if(W3STs != undefined && W3STs.length > 0) {
            count += W3STs.length;
        }
        if(count >= 10) {
            console.log(`zkcyberconnect [0] request: ${address}. cursor:${endCoursor}, haxNext:${hasNext}, count:${count}`);
            return true;
        }
    }
    
    // edges.push.apply(edges, currentEdges);
    if(hasNext && count < 10) {
        console.log(`zkcyberconnect [1] request: ${address}. cursor:${endCoursor}, haxNext:${hasNext}, count:${count}`);
        return await cyberConnectGraphqlQueryEssencesByCursor(endpoint, httpType, api_key, address, endCoursor, count)
    } else {
        console.log(`zkcyberconnect [2] request: ${address}. cursor:${endCoursor}, haxNext:${hasNext}, count:${count}`);
        return count >= 10;
    }
}
