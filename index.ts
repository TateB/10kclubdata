import { Command } from "commander";
import "dotenv/config";
import { Contract, Provider } from "ethcall";
import { ethers } from "ethers";
import fs from "fs/promises";
import { Parser } from "json2csv";
import ENSRegistry from "./abis/ENSRegistry.json";
import PublicResolver from "./abis/PublicResolver.json";

const program = new Command();

program
  .option(
    "-r --rpc <url>",
    "The RPC URL for the Ethereum node you want to connect to"
  )
  .option("-b --block <number>", "The block number to pull data from")
  .option("-f --format <csv|json>", "The format to output the data in", "json")
  .option(
    "-o --output <path>",
    "The path to output the data to",
    "./output.json"
  )
  .option(
    "-c --chunkSize <size>",
    "The number of calls to make at a time",
    "500"
  );

program.parse(process.argv);

const options = program.opts();

const _provider = new ethers.providers.JsonRpcProvider(options.rpc);

const registryAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const chunkArray = (array: any[], size: number): any[] => {
  if (array.length <= size) {
    return [array];
  }
  return [array.slice(0, size), ...chunkArray(array.slice(size), size)];
};

const chunkCalls = async (array: any[], provider: Provider) =>
  Promise.all(
    chunkArray(array, parseInt(options.chunkSize)).map((chunk) =>
      provider.tryAll(
        chunk,
        options.block ? parseInt(options.block) : undefined
      )
    )
  ).then((res) => res.reduce((prev, curr) => [...prev, ...curr], []));

const main = async () => {
  const provider = new Provider();
  await provider.init(_provider);

  const registry = new Contract(registryAddress, ENSRegistry);
  const resolvers = [
    {
      address: "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
      contract: new Contract(
        "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
        PublicResolver
      ),
    },
  ];

  let nameArray: {
    name: string;
    label: string;
    nameHash: string;
    owner?: string;
    resolver?: string;
    address?: string;
    shouldRemove?: boolean;
  }[] = [
    ...[...Array(1000).keys()].map((i) => i.toString().padStart(3, "0")),
    ...[...Array(10000).keys()].map((i) => i.toString().padStart(4, "0")),
  ].map((i) => ({
    name: `${i}.eth`,
    label: i,
    nameHash: ethers.utils.namehash(`${i}.eth`),
  }));

  console.log("Fetching owners...");

  const ownerCalls = nameArray.map((item) => registry.owner(item.nameHash));

  const ownerData = await chunkCalls(ownerCalls, provider);

  nameArray = ownerData
    .map((item, index) => ({
      ...nameArray[index],
      owner: item as string,
    }))
    .filter(
      (item) =>
        item.owner &&
        item.owner !== "0x0000000000000000000000000000000000000000"
    );

  console.log("Fetched all owners, valid name count:", nameArray.length);

  console.log("Fetching resolvers...");

  const calls = nameArray.map((item) => registry.resolver(item.nameHash));

  const resolverData = await chunkCalls(calls, provider);

  nameArray = resolverData
    .map((item, index) => ({
      ...nameArray[index],
      resolver: item as string,
    }))
    .filter((item) => item.resolver);

  console.log("Fetched all resolvers, valid name count:", nameArray.length);

  console.log("Fetching addresses...");

  const addrCalls = await Promise.all(
    nameArray.map(async (item, i) => {
      if (
        item.resolver &&
        !resolvers.find((x) => x.address === item.resolver)
      ) {
        const resolverTest = new Contract(item.resolver, PublicResolver);
        try {
          await provider.all([resolverTest.addr(item.nameHash)]);
          resolvers.push({
            address: item.resolver,
            contract: resolverTest,
          });
        } catch {
          nameArray[i].shouldRemove = true;
          return null;
        }
      }

      const resolver = resolvers.find((x) => x.address === item.resolver);
      return resolver!.contract.addr(item.nameHash);
    })
  ).then((res) => res.filter((x) => x));

  nameArray = nameArray.filter((item) => !item.shouldRemove);

  const addrData = await chunkCalls(addrCalls, provider);

  nameArray = addrData
    .map((item, index) => ({
      ...nameArray[index],
      address: item as string,
    }))
    .filter((item) => item.address);

  console.log("Fetched all addresses, valid name count:", nameArray.length);

  switch (options.format) {
    case "csv": {
      const csvParser = new Parser();
      await fs.writeFile(options.output, csvParser.parse(nameArray));
      break;
    }
    case "json": {
      await fs.writeFile(options.output, JSON.stringify(nameArray, null, 2));
      break;
    }
    default:
      throw new Error("Invalid format");
  }
  console.log("Wrote results to disk.");
};

main();
