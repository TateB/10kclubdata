# 10kclub data

gets the owner/address for 3-4 digit numerical ENS names.

## usage

```bash
git clone git@github.com:TateB/10kclubdata.git
cd 10kclubdata
yarn
yarn start [...args]
```

## args

```bash
Options:
  -r --rpc <url>          The RPC URL for the Ethereum node you want to connect to
  -b --block <number>     The block number to pull data from
  -f --format <csv|json>  The format to output the data in (default: "json")
  -o --output <path>      The path to output the data to (default: "./output")
  -c --chunkSize <size>   The number of calls to make at a time (default: "500")
  -h, --help              display help for command
```
