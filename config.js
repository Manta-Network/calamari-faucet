export const endpoint = {
    testing: 'wss://zenlink.zqhxuyuan.cloud:444',
    staging: 'wss://c1.calamari.seabird.systems',
    calamari: 'wss://i.calamari.systems',
};

// NOTE, change to 1 in staging/production
export const dripMultiply = 1;

// Not used for now.
export const dripAmount = 1500000000000;

export const adminKeyHash = "290510561";

// CHANGE SIGNER ACCOUNT
export const signer = {
    dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf: process.env.shortlist_signer,
};

export const signer_address = "dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf";

export const get_endpoint = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return endpoint.staging;
    } else if(env === "testing") {
        return endpoint.testing;
    } else {
        return endpoint.calamari;
    }
}

export const get_drip_collection = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return "staging-babt-drip-1";
    } else if(env === "testing") {
        return "testing-babt-drip-1";
    } else {
        return "prod-babt-drip";
    }
}

export const get_allowlist_collection = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return "staging-babt-allowlist-1";
    } else if(env === "testing") {
        return "testing-babt-allowlist-1";
    } else {
        return "prod-babt-allowlist";
    }
}

export const get_mintmeta_collection = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return "staging-mint-meta";
    } else if(env === "testing") {
        return "testing-mint-meta";
    } else {
        return "prod-mint-meta";
    }
}
