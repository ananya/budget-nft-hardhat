
let { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
let { Framework } = require("@superfluid-finance/sdk-core");
let { assert } = require("chai");
let { ethers, web3, artifacts } = require("hardhat");
let daiABI  = require("./abis/fDAIABI");

let deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
let deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
let deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

let provider = web3;

let accounts: any;

let sf: { loadSuperToken: (arg0: string) => { underlyingToken: { address: any; abi: any; }; address: any; upgrade: (arg0: { amount: any; }) => any; transfer: (arg0: { recipient: any; amount: any; }) => any; balanceOf: (arg0: { account: any; providerOrSigner: any; }) => any; } | PromiseLike<{ underlyingToken: { address: any; abi: any; }; address: any; upgrade: (arg0: { amount: any; }) => any; transfer: (arg0: { recipient: any; amount: any; }) => any; balanceOf: (arg0: { account: any; providerOrSigner: any; }) => any; }>; user: (arg0: { address: { address: any; }; token: any; }) => { address: string | number; }; createSigner: (arg0: { signer: { address: any; }; provider: any; }) => any; settings: { config: { hostAddress: any; cfaV1Address: any; }; }; cfaV1: { createFlow: (arg0: { receiver: any; superToken: any; flowRate: string; }) => any; getNetFlow: (arg0: { superToken: any; account: any; providerOrSigner: any; }) => any; }; };
let dai: { connect: (arg0: any) => { (): any; new(): any; mint: { (arg0: any, arg1: any): any; new(): any; }; approve: { (arg0: any, arg1: any): any; new(): any; }; }; };
let daix: any;
let superSigner: any;
let BudgetNFT: any;
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
    
    BudgetNFT = await App.deploy(
        "BudgetNFT",
        "BNFT",
        sf.settings.config.hostAddress,
        sf.settings.config.cfaV1Address,
        daix.address
    );
    
    // add money to contract
    const appInitialBalance = await daix.balanceOf({
        account: BudgetNFT.address,
        providerOrSigner: accounts[0]
    });

    const createFlowOperation = await sf.cfaV1.createFlow({
        receiver: BudgetNFT.address,
        superToken: daix.address,
        flowRate: "100000000",
    })    
    
    const txn = await createFlowOperation.exec(accounts[0]);
    // const receipt = await txn.wait();
});

// beforeEach(async function () {
    
//     await dai.connect(accounts[0]).mint(
//         accounts[0].address, ethers.utils.parseEther("1000")
//     );

//     await dai.connect(accounts[0]).approve(daix.address, ethers.utils.parseEther("1000"));

//     const daixUpgradeOperation = daix.upgrade({
//         amount: ethers.utils.parseEther("1000")
//     });

//     await daixUpgradeOperation.exec(accounts[0]);

//     const daiBal = await daix.balanceOf({account: accounts[0].address, providerOrSigner: accounts[0]});
//     console.log('daix bal for acct 0: ', daiBal);

//     await daix.transfer({
//         recipient: accounts[2], 
//         amount: ethers.utils.parseEther("500")
//     });
// });

describe("issue NFT", async function () {
  it("Case #1 - NFT is issued to Alice", async () => {
    // const alice = accounts[1];

    // await dai.connect(alice).mint(
    //   alice.address, ethers.utils.parseEther("1000")
    // );

    // await dai.connect(alice).approve(daix.address, ethers.utils.parseEther("1000"));

    // const daixUpgradeOperation = daix.upgrade({
    //     amount: ethers.utils.parseEther("1000")
    // });

    // await daixUpgradeOperation.exec(alice);

    // const daiBal = await daix.balanceOf({account: alice.address, providerOrSigner: accounts[0]});
    // console.log('daix bal for acct alice: ', daiBal);

    
    // // key action - NFT is issued to alice w flowrate
    // await BudgetNFT.issueNFT(
    //   alice.address,
    //   "1"
    // );

    // const aliceFlow = await sf.cfaV1.getNetFlow({
    //   superToken: daix.address,
    //   account: alice.address,
    //   providerOrSigner: superSigner
    // });

    // const appFlowRate = await sf.cfaV1.getNetFlow({
    //   superToken: daix.address,
    //   account: BudgetNFT.address,
    //   providerOrSigner: superSigner
    // });

    // const adminFlowRate = await sf.cfaV1.getNetFlow({
    //   superToken: daix.address,
    //   account: accounts[0].address,
    //   providerOrSigner: superSigner
    // });

    // //make sure that alice receives correct flow rate
    // assert.equal(
    //   aliceFlow.toString(),
    //   toWad(0.001).toString(),
    //   "alice flow is inaccurate"
    // );

    // //make sure app has right flow rate
    // assert.equal(
    //   Number(adminFlowRate),
    //   (Number(adminFlowRate) * - 1) - Number(aliceFlow),
    //   "app net flow is incorrect"
    // );

    // //burn NFT created in this test
    // await BudgetNFT.burnNFT(0, { from: accounts[0] });
  });
});