# BOOM! Bots Stats

An API for statistics on the BOOM! protocol.

### Endpoints

- GET Bot List State https://stats.boombots.xyz/state/?chainID=168587773&v=v0.1.0
  - and get more details on bot https://stats.boombots.xyz/state/?chainID=168587773&v=v0.1.0&focusBotID=5

### Usage

``` bash
curl https://stats.boombots.xyz/state/?chainID=168587773&v=v0.1.0
```

``` js
axios.get("https://stats.boombots.xyz/state/?chainID=168587773&v=v0.1.0")
```

### Development and Deployment

Install the AWS SAM CLI  
https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html

To update an existing function, find the handler function in `api/`.

To create a new function or update the infrastructure, add it as infrastructure as code in `template.yaml`

To deploy to AWS:
``` bash
sam build --use-container
sam deploy
```
