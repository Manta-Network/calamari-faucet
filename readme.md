## calamari faucet
### an aws lambda using the nodejs 18 runntime

#### bootstrap
this project was created like so:

```bash
mkdir calamari-faucet && cd calamari-faucet

curl -Lo ./.gitignore https://raw.githubusercontent.com/serverless/serverless-starter/master/.gitignore

git init
hub create Manta-Network/calamari-faucet

yarn add serverless serverless-offline --dev
# add '"type": "module"' to package.json

touch ./serverless.yml
# populate serverless.yml

touch ./handler.js
# populate handler.js
```

#### secrets and parameters

the serverless.yml contains lines like so:

```yml
  region: eu-central-1
  ...
          Resource: 'arn:aws:ssm:eu-central-1::parameter/calamari_faucet_*'
  ...
    environment:
      api_token: ${ssm:/calamari_faucet_api_token}
```

which sets the aws deployment region to `eu-central-1` and grants the lamda access to parameters beginning with `calamari_faucet_`. the lamda's dependencies should be in the same region as the lambda and may be configured at: https://eu-central-1.console.aws.amazon.com/systems-manager/parameters?region=eu-central-1, by creating parameters with names starting with `calamari_faucet_`. take care to set the type of the parameter to `SecureString` if it contains a secret. the configuration makes an environment variable named `api_token` available to the lambda function and sets its value from the parameter store's `calamari_faucet_api_token` value.

#### test
this project can be run locally like so:

```bash
serverless offline
```

or to specify a port other than the default (3000):

```bash
serverless offline --httpPort 3001
```

#### deploy
this project is deployed to aws like so:

```bash
serverless deploy
```

check the output of the above command to obtain the url(s) to deployed functions. eg:

```
$ serverless deploy
Running "serverless" from node_modules

Deploying calamari-faucet to stage prod (eu-central-1)

✔ Service deployed to stack calamari-faucet-prod (34s)

endpoint: GET - https://muhnq5ml7j.execute-api.eu-central-1.amazonaws.com/prod/account/{babtAddress}/{kmaAddress}
functions:
  drip: calamari-faucet-prod-drip (114 kB)
```

eg: https://muhnq5ml7j.execute-api.eu-central-1.amazonaws.com/prod/account/asdf/hjkl

#### deployment credentials

the serverless.yml contains a line like so:

```yml
  profile: manta-service
```

which is a reference to an aws credential set in an aws credential file which is by convention found at `${HOME}/.aws/credentials` and contains a section like this:

```ini
[manta-service]
aws_access_key_id = AKIAXXXXXXXXXXXXXXXX
aws_secret_access_key = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
 
the credentials required can be created at: https://console.aws.amazon.com/iamv2/home#/users/details/${username}/create-access-key (replace `${username}` with your actual username)
