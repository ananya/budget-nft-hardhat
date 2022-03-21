
let { toWad } = require("@decentral.ee/web3-helpers");
let { Framework } = require("@superfluid-finance/sdk-core");
let { assert } = require("chai");
let { ethers, web3 } = require("hardhat");
let daiABI = require("./abis/fDAIABI");
import traveler from "ganache-time-traveler";
const TEST_TRAVEL_TIME = 3600 * 2; // 1 hours


let deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
let deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
let deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

let provider = web3;

let accounts: any[]

let sf: { createSigner: (arg0: { signer: any; provider: any; }) => any; loadSuperToken: (arg0: string) => any; settings: { config: { hostAddress: any; cfaV1Address: any; }; }; cfaV1: { createFlow: (arg0: { receiver: any; superToken: any; flowRate: any; }) => any; getNetFlow: (arg0: { superToken: any; account: any; providerOrSigner: any; }) => any; }; };
let dai: { mint: (arg0: any, arg1: any) => any; approve: (arg0: any, arg1: any) => any; connect: (arg0: any) => { (): any; new(): any; mint: { (arg0: any, arg1: any): any; new(): any; }; approve: { (arg0: any, arg1: any): any; new(): any; }; }; };
let daix: { underlyingToken: { address: any; }; address: any; balanceOf: (arg0: { account: any; providerOrSigner: any; }) => any; upgrade: (arg0: { amount: any; }) => any; }
let superSigner: any
let BudgetNFT: { address: any; issueNFT: (arg0: any, arg1: any) => any; burnNFT: (arg0: number) => any; editNFT: (arg0: number, arg1: any) => any; connect: (arg0: any) => { (): any; new(): any; splitStream: { (arg0: number, arg1: any): any; new(): any; }; mergeStreams: { (arg0: number, arg1: number): any; new(): any; }; }; }

let errorHandler = (err: any) => {
  if (err) throw err;
};

before(async function () {
  //get accounts from hardhat
  accounts = await ethers.getSigners();

  //deploy the framework
  await deployFramework(errorHandler, {
    web3,
    from: accounts[0].address,
  });

  //deploy a fake erc20 token
  let fDAIAddress = await deployTestToken(errorHandler, [":", "fDAI"], {
    web3,
    from: accounts[0].address,
  });

  //deploy a fake erc20 wrapper super token around the fDAI token
  let fDAIxAddress = await deploySuperToken(errorHandler, [":", "fDAI"], {
    web3,
    from: accounts[0].address,
  });

  console.log("fDAIxAddress: ", fDAIxAddress);
  console.log("fDAIAddress: ", fDAIAddress);

  //initialize the superfluid framework...put custom and web3 only bc we are using hardhat locally
  sf = await Framework.create({
    networkName: "custom",
    provider,
    dataMode: "WEB3_ONLY",
    resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
    protocolReleaseVersion: "test",
  });

  superSigner = await sf.createSigner({
    signer: accounts[0],
    provider: provider
  });

  //use the framework to get the super token
  daix = await sf.loadSuperToken("fDAIx");

  //get the contract object for the erc20 token
  let daiAddress = daix.underlyingToken.address;
  dai = new ethers.Contract(daiAddress, daiABI, accounts[0]);

  let App = await ethers.getContractFactory("BudgetNFT", accounts[0]);

  //deploy the contract
  BudgetNFT = await App.deploy(
    "BudgetNFT",
    "BNFT",
    sf.settings.config.hostAddress,
    sf.settings.config.cfaV1Address,
    daix.address
  );

  const appInitialBalance = await daix.balanceOf({
    account: BudgetNFT.address,
    providerOrSigner: accounts[0]
  });

  console.log("appInitialBalance: ", appInitialBalance); // initial balance of the app is 0

  await dai.mint(
    accounts[0].address, ethers.utils.parseEther("1000")
  );

  await dai.approve(daix.address, ethers.utils.parseEther("1000"));

  const daixUpgradeOperation = daix.upgrade({
    amount: ethers.utils.parseEther("1000")
  });

  await daixUpgradeOperation.exec(accounts[0]);

  const daiBal = await daix.balanceOf({
    account: accounts[0].address,
    providerOrSigner: accounts[0]
  });
  console.log('daix bal for acct 0: ', daiBal);

  // add flow to contract
  const createFlowOperation = await sf.cfaV1.createFlow({
    receiver: BudgetNFT.address,
    superToken: daix.address,
    flowRate: toWad(0.01).toString(),
  })

  const txn = await createFlowOperation.exec(accounts[0]);
  const receipt = await txn.wait();

  console.log("go forward in time");
  await traveler.advanceTimeAndBlock(TEST_TRAVEL_TIME);

  const balance = await daix.balanceOf({ account: BudgetNFT.address, providerOrSigner: accounts[0] });
  console.log('daix bal after flow: ', balance);
});

beforeEach(async function () {
  let alice = accounts[1];

  await dai.connect(alice).mint(
    alice.address, ethers.utils.parseEther("1000")
  );

  await dai.connect(alice).approve(
    daix.address, ethers.utils.parseEther("1000")
  );

  const daixUpgradeOperation = daix.upgrade({
    amount: ethers.utils.parseEther("1000")
  });

  await daixUpgradeOperation.exec(alice);

  const daiBal = await daix.balanceOf({ account: alice.address, providerOrSigner: accounts[0] });
  console.log('daix bal for acct alice: ', daiBal);
});

async function netFlowRate(user: any) {
  const flow = await sf.cfaV1.getNetFlow({
    superToken: daix.address,
    account: user.address,
    providerOrSigner: superSigner
  });
  return flow;
}

describe("issue NFT", async function () {
  it("Case #1 - NFT is issued to Alice", async () => {
    let alice = accounts[1];

    // key action - NFT is issued to alice w flowrate
    await BudgetNFT.issueNFT(
      alice.address,
      toWad(0.001).toString(),
    );

    const aliceFlow = await netFlowRate(alice)
    const appFlowRate = await netFlowRate(BudgetNFT);
    const adminFlowRate = await netFlowRate(accounts[0]);

    console.log("alice flow: ", aliceFlow);
    console.log("app flow: ", appFlowRate);
    console.log("admin flow: ", adminFlowRate);

    //make sure that alice receives correct flow rate
    assert.equal(
      aliceFlow.toString(),
      toWad(0.001).toString(),
      "alice flow is inaccurate"
    );

    //make sure app has right flow rate
    assert.equal(
      Number(appFlowRate),
      (Number(adminFlowRate) * - 1) - Number(aliceFlow),
      "app net flow is incorrect"
    );

    //burn NFT created in this test
    await BudgetNFT.burnNFT(0);
  });

  it("Case #2 - NFT is edited", async () => {
    let alice = accounts[1];

    // key action - NFT is issued to alice w flowrate
    await BudgetNFT.issueNFT(
      alice.address,
      toWad(0.001).toString(),
    );

    //key action #2 = NFT flowRate is edited. first param here is tokenId, which is now 1
    await BudgetNFT.editNFT(
      1,
      toWad(0.002).toString(),
    );

    const aliceFlow = await netFlowRate(alice);

    const appFlowRate = await netFlowRate(BudgetNFT);

    const adminFlowRate = await netFlowRate(accounts[0]);

    //make sure that alice receives correct flow rate
    assert.equal(
      aliceFlow,
      toWad(0.002).toString(),
      "Alice flow rate is inaccurate"
    );

    //make sure app has right flow rate
    assert.equal(
      Number(appFlowRate),
      (Number(adminFlowRate) * - 1) - Number(aliceFlow),
      "app net flow is incorrect"
    );

    //burn NFT created in this test
    await BudgetNFT.burnNFT(1);
  });
});

describe("burn NFT", async function () {
  it("Case #1 - NFT is issued to Alice, then burned", async () => {
    let alice = accounts[1];

    //key action - NFT is issued to alice w flowrate
    await BudgetNFT.issueNFT(
      alice.address,
      toWad(0.001).toString(),
    );

    const aliceFlow = await netFlowRate(alice);

    //make sure that alice receives correct flow rate
    assert.equal(
      aliceFlow,
      toWad(0.001).toString(),
      "Alice flow rate is inaccurate"
    );

    //key action #2 - NFT is burned, which should turn off flow rate (this token id is number 2)
    await BudgetNFT.burnNFT(2);

    const aliceFlowAfterBurned = await netFlowRate(alice);
    console.log("Alice flow rate after ID #2 is burned " + aliceFlowAfterBurned);

    const appFlow = await netFlowRate(BudgetNFT);
    const adminFlow = await netFlowRate(accounts[0]);

    //make sure that alice receives correct flow rate
    assert.equal(
      aliceFlowAfterBurned,
      0,
      "Alice flow rate is inaccurate, should be zero"
    );

    //make sure app has right flow rate
    assert.equal(
      Number(appFlow),
      (Number(adminFlow) * - 1),
      "app net flow is incorrect"
    );
  });
})

describe("split and merge NFTs", async function () {
  it("Case #1 - NFT is issued to Alice, then split", async () => {
    let alice = accounts[1];

    //key action - NFT is issued to alice w flowrate
    await BudgetNFT.issueNFT(
      alice.address,
      toWad(0.001).toString(),
    );

    //key action #2 - NFT is split, which should cut flow rate in half from each NFT. this token ID is number 3
    await BudgetNFT.connect(alice).splitStream(
      3,
      toWad(0.0005).toString(),
    );

    const aliceFlow = await netFlowRate(alice);

    //As alice is the owner of both the NFTs, flow rate should be the the sum of flowrate in both NFTs
    assert.equal(
      aliceFlow,
      toWad(0.001),
      "Alice flow rate is inaccurate, should be the same at first"
    );

    //key action #3 - new NFT creating in split is burned, leaving only 1/2 of alice flow rate left
    //NFT being burned is Alice's 4th token
    await BudgetNFT.burnNFT(4);

    const aliceUpdatedFlow = await netFlowRate(alice);

    assert.equal(
      aliceUpdatedFlow,
      toWad(0.0005).toString(),
      "Alice flow rate is inaccurate, should be 1/2 original"
    );

    const appFlow = await netFlowRate(BudgetNFT);
    const adminFlow = await netFlowRate(accounts[0]);

    // make sure app has right flow rate
    assert.equal(
      Number(appFlow) + Number(aliceUpdatedFlow),
      (Number(adminFlow) * - 1),
      "app net flow is incorrect"
    );

    //burn NFT created in this test - #4 is already burned, so need to also burn 3
    await BudgetNFT.burnNFT(3);
  });

  it("Case #2 - NFT is issued to Alice, split, then merged again", async () => {
    let alice = accounts[1];

    //key action - NFT is issued to alice w flowrate
    await BudgetNFT.issueNFT(
      alice.address,
      toWad(0.001).toString(),
    );

    //key action #2 - NFT is split, which should cut flow rate in half from each NFT
    await BudgetNFT.connect(alice).splitStream(
      5,
      toWad(0.0005).toString(),
    );

    const aliceFlow = await netFlowRate(alice);

    console.log(`Alice Flow Rate is now: ${aliceFlow}`);

    //make sure that alice receives correct flow rate
    assert.equal(
      aliceFlow,
      toWad(0.001),
      "Alice flow rate is inaccurate, should be the same at first"
    );

    //key action #3 - 2 new NFTs are merged, alice should still have 100% of flow rate
    //note: the newly split NFT from previous action in this case is now ID #6. it is also burned by this action
    await BudgetNFT.connect(alice).mergeStreams(5, 6);

    const aliceUpdatedFlow = await netFlowRate(alice);
    const adminFlow = await netFlowRate(accounts[0]);
    const appFlow = await netFlowRate(BudgetNFT);

    assert.equal(
      aliceUpdatedFlow,
      toWad(0.001),
      "Alice flow rate is inaccurate, should be 100% of original"
    );

    // make sure app has right flow rate
    assert.equal(
      Number(appFlow) + Number(aliceUpdatedFlow),
      (Number(adminFlow) * - 1),
      "app net flow is incorrect"
    );

    //burn NFT created in this test
    await BudgetNFT.burnNFT(5);
  });
})