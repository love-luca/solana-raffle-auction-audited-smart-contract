import {DevEnvironment} from "../libraries/DevEnvironment";
import {expect, use} from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiSubset from "chai-subset";
import {describe} from "mocha";
import {toLamport} from "../libraries/ProgramUtils";
import {BN, IdlTypes} from "@project-serum/anchor";
import {
  JustiesProgramClient,
  RevenueShareConfig
} from "../libraries/JustiesProgramClient";
import {PublicKey} from "@solana/web3.js";
import {generatorToList} from "../libraries/Utils";

use(chaiAsPromised);
use(chaiSubset);

type GroupConfig = IdlTypes<Justies>["GroupConfig"];
type GroupType = IdlTypes<Justies>["GroupType"];

function prettyPrint(name: string, message: any) {
  console.log(`${name}: ${JSON.stringify(message, undefined, 2)}`);
}

async function setupJustiesAuctionTestAccounts(devEnv: DevEnvironment) {
  devEnv.createJustiesClient("auctionCreator");
  await devEnv.airdrop("auctionCreator", 100);
  await devEnv.transferNft("auctionCreator", "Gods #1");
  await devEnv.transferNft("auctionCreator", "justs #1");
  await devEnv.transferNft("auctionCreator", "Bar #1");
  await devEnv.mintTokens("auctionCreator", "USDC", 1000);
  await devEnv.mintTokens("auctionCreator", "USDT", 10000);

  devEnv.createJustiesClient("bidder1");
  await devEnv.airdrop("bidder1", 100);
  await devEnv.transferNft("bidder1", "justs #3");
  await devEnv.transferNft("bidder1", "Gods #3");
  await devEnv.transferNft("bidder1", "Standalone #1");
  await devEnv.mintTokens("bidder1", "USDC", 1000);
  await devEnv.mintTokens("bidder1", "USDT", 10000);

  devEnv.createJustiesClient("bidder2");
  await devEnv.airdrop("bidder2", 100);
  await devEnv.mintTokens("bidder2", "USDC", 1000);
  await devEnv.mintTokens("bidder2", "USDT", 10000);

  devEnv.createJustiesClient("bidder3");
  await devEnv.airdrop("bidder3", 100);
  await devEnv.mintTokens("bidder3", "USDC", 1000);
}

async function setupJustiesRaffleTestAccounts(devEnv: DevEnvironment) {
  devEnv.createJustiesClient("raffleCreator");
  await devEnv.airdrop("raffleCreator", 100);
  await devEnv.createSft("Gift Card #1", 2, "Gift Card", "raffleCreator");
  await devEnv.createSft("Gift Card #2", 30, "Gift Card", "raffleCreator");
  await devEnv.transferNft("raffleCreator", "Gods #2");
  await devEnv.transferNft("raffleCreator", "justs #2");
  await devEnv.transferNft("raffleCreator", "Bar #2");
  await devEnv.mintTokens("raffleCreator", "USDC", 1000);
  await devEnv.mintTokens("raffleCreator", "USDT", 10000);

  devEnv.createJustiesClient("ticketBuyer1");
  await devEnv.airdrop("ticketBuyer1", 100);
  await devEnv.transferNft("ticketBuyer1", "justs #4");
  await devEnv.transferNft("ticketBuyer1", "Gods #4");
  await devEnv.transferNft("ticketBuyer1", "Standalone #2");
  await devEnv.mintTokens("ticketBuyer1", "USDC", 1000);
  await devEnv.mintTokens("ticketBuyer1", "USDT", 10000);

  devEnv.createJustiesClient("ticketBuyer2");
  await devEnv.airdrop("ticketBuyer2", 100);
  await devEnv.mintTokens("ticketBuyer2", "USDC", 1000);
  await devEnv.mintTokens("ticketBuyer2", "USDT", 10000);

  devEnv.createJustiesClient("ticketBuyer3");
  await devEnv.airdrop("ticketBuyer3", 100);
  await devEnv.mintTokens("ticketBuyer3", "USDC", 1000);
  await devEnv.mintTokens("ticketBuyer3", "USDT", 400);

  devEnv.createJustiesClient("ticketBuyer4");
  await devEnv.airdrop("ticketBuyer4", 100);
  await devEnv.mintTokens("ticketBuyer4", "USDC", 1000);
}

async function restoreConfigs(
  client: JustiesProgramClient,
  originalGlobalStates
) {
  let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
  input.marketFeeRateBps = originalGlobalStates.marketFeeRateBps;
  input.feeTreasuryAddress = originalGlobalStates.feeTreasuryAddress;
  input.minOutbidRateBps = originalGlobalStates.minOutbidRateBps;
  input.lastMinutesForAuctionExtend =
    originalGlobalStates.lastMinutesForAuctionExtend;
  input.auctionExtendMinutes = originalGlobalStates.auctionExtendMinutes;
  input.minAuctionDuration = originalGlobalStates.minAuctionDuration;
  input.maxAuctionDuration = originalGlobalStates.maxAuctionDuration;
  input.minRaffleTicketSupply = originalGlobalStates.minRaffleTicketSupply;
  input.maxRaffleTicketSupply = originalGlobalStates.maxRaffleTicketSupply;
  input.maxRaffledNfts = originalGlobalStates.maxRaffledNfts;
  input.minRaffleDuration = originalGlobalStates.minRaffleDuration;
  input.maxRaffleDuration = originalGlobalStates.maxRaffleDuration;
  input.auctionCreationEnabled =
    originalGlobalStates.auctionCreationEnabled;
  input.raffleCreationEnabled = originalGlobalStates.raffleCreationEnabled;
  input.numKeysPerIndexPage = originalGlobalStates.numKeysPerIndexPage;
  await client.updateConfigs(input);
}

describe("Justies Test", () => {
  const devEnv = new DevEnvironment("Justies Test");
  let feeTreasurySigner = devEnv.generateKeypair();
  let feeTreasuryAddress = feeTreasurySigner.publicKey;
  let revenueShareWalletSigner = devEnv.generateKeypair();
  let revenueShareWalletAddress = revenueShareWalletSigner.publicKey;

  before(async () => {
    console.log("Setup the dev environment...");
    await devEnv.setup();
  });

  describe("Program setting", () => {
    let justiesClient: JustiesProgramClient;

    before(async () => {
      justiesClient = devEnv.justiesClient("authority");
      // isTestEnvironment is true here as we need to mock the timestamp for
      // testing.
      await justiesClient.initProgram(200, feeTreasuryAddress, true);
      const updateConfigInput = JustiesProgramClient.getDefaultUpdateConfigsInput();
      // Set a smaller indexing page size to increase test coverage (e.g.: to
      // cover the case to create new indexing page).
      updateConfigInput.numKeysPerIndexPage = 2;
      await justiesClient.updateConfigs(updateConfigInput);
    });

    it("Update regular configs", async () => {
      let originalGlobalStates = await justiesClient.fetchGlobalStates();
      const newFeeTreasuryAddress = devEnv.generateKeypair().publicKey;
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.marketFeeRateBps = 250;
      input.feeTreasuryAddress = newFeeTreasuryAddress;
      input.minOutbidRateBps = 510;
      input.lastMinutesForAuctionExtend = 8;
      input.auctionExtendMinutes = 9;
      input.minAuctionDuration = new BN(5 * 3600);
      input.maxAuctionDuration = new BN(8 * 24 * 3600);
      input.minRaffleTicketSupply = 50;
      input.maxRaffleTicketSupply = 6000;
      input.maxRaffledNfts = 19;
      input.minRaffleDuration = new BN(4 * 3600);
      input.maxRaffleDuration = new BN(9 * 24 * 3600);
      input.auctionCreationEnabled = false;
      input.raffleCreationEnabled = false;
      input.numKeysPerIndexPage = 150;

      await justiesClient.updateConfigs(input);
      const globalStates = await justiesClient.fetchGlobalStates();
      expect(globalStates).to.containSubset({
        marketFeeRateBps: 250,
        feeTreasuryAddress: newFeeTreasuryAddress,
        minOutbidRateBps: 510,
        lastMinutesForAuctionExtend: 8,
        auctionExtendMinutes: 9,
        minAuctionDuration: new BN(5 * 3600),
        maxAuctionDuration: new BN(8 * 24 * 3600),
        minRaffleTicketSupply: 50,
        maxRaffleTicketSupply: 6000,
        maxRaffledNfts: 19,
        minRaffleDuration: new BN(4 * 3600),
        maxRaffleDuration: new BN(9 * 24 * 3600),
        auctionCreationEnabled: false,
        raffleCreationEnabled: false,
        numKeysPerIndexPage: 150,
      });
      await restoreConfigs(justiesClient, originalGlobalStates);
    });

    it("Error - invalid market fee rate bps", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.marketFeeRateBps = 0;
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidMarketFeeRate");
      input.marketFeeRateBps = 10001;
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidMarketFeeRate");
    });

    it("Error - invalid min outbid rate bps", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.minOutbidRateBps = 0;
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidMinOutbidRate");
      input.minOutbidRateBps = 10001;
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidMinOutbidRate");
    });

    it("Error - invalid auction extend settings", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.lastMinutesForAuctionExtend = 0;
      input.auctionExtendMinutes = 10;
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidAuctionExtensionSettings");
      input.lastMinutesForAuctionExtend = 10;
      input.auctionExtendMinutes = 0;
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidAuctionExtensionSettings");
    });

    it("Error - invalid auction duration range settings", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.minAuctionDuration = new BN(0);
      input.maxAuctionDuration = new BN(0);
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidAuctionDurationRangeSettings");

      input.minAuctionDuration = new BN(3600);
      input.maxAuctionDuration = new BN(3600);
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidAuctionDurationRangeSettings");

      input.minAuctionDuration = new BN(3601);
      input.maxAuctionDuration = new BN(3600);
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidAuctionDurationRangeSettings");
    });

    it("Error - invalid raffle ticket supply settings", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.minRaffleTicketSupply = 0;
      input.maxRaffleTicketSupply = 0;
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleTicketSupplyRangeSettings");

      input.minRaffleTicketSupply = 100;
      input.maxRaffleTicketSupply = 100;
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleTicketSupplyRangeSettings");

      input.minRaffleTicketSupply = 101;
      input.maxRaffleTicketSupply = 100;
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleTicketSupplyRangeSettings");
    });

    it("Error - invalid raffle duration range settings", async () => {
      let input = JustiesProgramClient.getDefaultUpdateConfigsInput();
      input.minRaffleDuration = new BN(0);
      input.maxRaffleDuration = new BN(0);
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleDurationRangeSettings");

      input.minRaffleDuration = new BN(3600);
      input.maxRaffleDuration = new BN(3600);
      expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleDurationRangeSettings");

      input.minRaffleDuration = new BN(3601);
      input.maxRaffleDuration = new BN(3600);
      return expect(justiesClient.updateConfigs(input)).to.eventually.be
        .rejectedWith("Error Code: InvalidRaffleDurationRangeSettings");
    });
  });

  describe("Allowlisting", () => {
    it("Add currency tokens to allowlist", async () => {
      const justiesClient = devEnv.justiesClient("authority");
      console.log("Adding wSOL to allowlist...");
      await justiesClient.addCurrencyTokenToAllowlist(
        devEnv.getTokenMintAddress("wSOL"));

      console.log("Adding USDC to allowlist...");
      await justiesClient.addCurrencyTokenToAllowlist(
        devEnv.getTokenMintAddress("USDC"));

      console.log("Adding USDT to allowlist...");
      await justiesClient.addCurrencyTokenToAllowlist(
        devEnv.getTokenMintAddress("USDT"));

      expect(await generatorToList(
        justiesClient.getTokenAllowlistStates())).to.containSubset([
        {
          tokenMintAddress: devEnv.getTokenMintAddress("wSOL"),
          allowed: true,
        },
        {
          tokenMintAddress: devEnv.getTokenMintAddress("USDC"),
          allowed: true,
        },
        {
          tokenMintAddress: devEnv.getTokenMintAddress("USDT"),
          allowed: true,
        },
      ]);
    });

    it(
      "Error - add currency token to allowlist with invalid index page.",
      async () => {
        const justiesClient = devEnv.justiesClient("authority");
        expect(justiesClient.addCurrencyTokenToAllowlist(
          devEnv.getTokenMintAddress("FOO"), 0)
        ).to.eventually.be
          .rejectedWith("token_allowlist_index. Error Code: ConstraintSeeds");
        return expect(justiesClient.addCurrencyTokenToAllowlist(
          devEnv.getTokenMintAddress("FOO"), 2)
        ).to.eventually.be
          .rejectedWith("token_allowlist_index. Error Code: ConstraintSeeds");
      }
    );

    it("Add nft collections to allowlist", async () => {
      const justiesClient = devEnv.justiesClient("authority");
      console.log("Adding Gods to allowlist...");
      await justiesClient.addNftCollectionToAllowlist(
        devEnv.getNftCollection("Gods").address);

      console.log("Adding justs to allowlist...");
      await justiesClient.addNftCollectionToAllowlist(
        devEnv.getNftCollection("justs").address);

      console.log("Adding Gift Card to allowlist...");
      await justiesClient.addNftCollectionToAllowlist(
        devEnv.getNftCollection("Gift Card").address);

      const allAllowlistStates = [];
      for await (const state of justiesClient.getNftAllowlistStates()) {
        allAllowlistStates.push(state);
      }
      expect(await generatorToList(
        justiesClient.getNftAllowlistStates())).to.containSubset([
        {
          tokenMintAddress: devEnv.getNftCollection("Gods").address,
          allowed: true,
        },
        {
          tokenMintAddress: devEnv.getNftCollection("justs").address,
          allowed: true,
        },
        {
          tokenMintAddress: devEnv.getNftCollection("Gift Card").address,
          allowed: true,
        },
      ]);
    });

    it(
      "Error - add nft collection to allowlist with invalid index page.",
      async () => {
        const justiesClient = devEnv.justiesClient("authority");
        expect(justiesClient.addNftCollectionToAllowlist(
          devEnv.getNftCollection("Bar").address, 0)
        ).to.eventually.be
          .rejectedWith("nft_allowlist_index. Error Code: ConstraintSeeds");
        return expect(justiesClient.addNftCollectionToAllowlist(
          devEnv.getNftCollection("Bar").address, 2)
        ).to.eventually.be
          .rejectedWith("nft_allowlist_index. Error Code: ConstraintSeeds");
      }
    );
  });

  describe("Auction", () => {
    before(async () => {
      await setupJustiesAuctionTestAccounts(devEnv);
    });

    describe("Creation error handling", () => {
      it("Error - create auction with invalid duration", async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");

        // case 0: create an auction with over-short duration.
        expect(justiesClient.createAuction(
          devEnv.getNft("Gods #1").mint.address,
          devEnv.getTokenMintAddress("USDT"),
          100,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ]
        )).to.eventually.be.rejectedWith("Error Code: InvalidAuctionDuration");

        // case 1: create an auction with over-long duration.
        return expect(justiesClient.createAuction(
          devEnv.getNft("Gods #1").mint.address,
          devEnv.getTokenMintAddress("USDT"),
          8 * 24 * 3600,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ]
        )).to.eventually.be.rejectedWith("Error Code: InvalidAuctionDuration");
      });
      it("Error - create auction with unsupported currency token", async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");
        // Token "FOO" is not in the allowlist.
        // The txn will fail with "AccountNotInitialized" error.
        return expect(justiesClient.createAuction(
          devEnv.getNft("Gods #1").mint.address,
          devEnv.getTokenMintAddress("FOO"),
          24 * 3600,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ]
        )).to.eventually.be.rejectedWith(
          "caused by account: token_allowlist_states. Error Code: AccountNotInitialized");
      });
      it("Error - create auction with unsupported nft", async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");
        // Collection "Bar" is not in the allowlist.
        // The txn will fail with "AccountNotInitialized" error.
        return expect(justiesClient.createAuction(
          devEnv.getNft("Bar #1").mint.address,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ]
        )).to.eventually.be.rejectedWith(
          "caused by account: nft_allowlist_states. Error Code: AccountNotInitialized");
      });
      it("Error - create auction with unowned nft", async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");
        // case 0: auctionCreator doesn't own "Gods #2".
        // The txn will fail with "AccountNotInitialized" error.
        expect(justiesClient.createAuction(
          devEnv.getNft("Gods #2").mint.address,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ]
        )).to.eventually.be.rejectedWith(
          "caused by account: creator_nft_account. Error Code: AccountNotInitialized");

        // case 1: auctionCreator doesn't own "Gods #3", but created the
        // auction with an existing token account owned by someone else.
        // The txn will fail due to constraint failure (owners mismatch).
        const nftTokenAddress = devEnv.getNftAta("bidder1", "Gods #3");
        return expect(justiesClient.createAuction(
          devEnv.getNft("Gods #3").mint.address,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          50e9,
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
              shareBps: 9000,
            },
          ],
          nftTokenAddress,
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidAuctionCreatorNftAccount");
      });
      it(
        "Error - create auction with incorrect revenue share config",
        async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");

          // Case 0: no revenue shares configured.
          expect(justiesClient.createAuction(
            devEnv.getNft("Gods #1").mint.address,
            devEnv.getTokenMintAddress("USDT"),
            24 * 3600,
            50e9,
            [],
            [],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");

          // Case 1: sum of shares < 10000
          expect(justiesClient.createAuction(
            devEnv.getNft("Gods #1").mint.address,
            devEnv.getTokenMintAddress("USDT"),
            24 * 3600,
            50e9,
            [],
            [
              {
                revenueReceiver: revenueShareWalletAddress,
                shareBps: 1000,
              },
              {
                revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
                shareBps: 2000,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");

          // Case 3: sum of shares > 10000
          return expect(justiesClient.createAuction(
            devEnv.getNft("Gods #1").mint.address,
            devEnv.getTokenMintAddress("USDT"),
            24 * 3600,
            50e9,
            [],
            [
              {
                revenueReceiver: revenueShareWalletAddress,
                shareBps: 1000,
              },
              {
                revenueReceiver: devEnv.getTokenAta("auctionCreator", "USDT"),
                shareBps: 9500,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");
        }
      );
      it(
        "Error - create auction when auction creation is disabled.",
        async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const originalGlobalStates = await justiesClient.fetchGlobalStates();

          const updateConfigsInput = JustiesProgramClient.getDefaultUpdateConfigsInput();
          updateConfigsInput.auctionCreationEnabled = false;
          await devEnv.justiesClient("authority")
            .updateConfigs(updateConfigsInput);

          await expect(justiesClient.createAuction(
            devEnv.getNft("Gods #1").address,
            devEnv.getTokenMintAddress("USDT"),
            24 * 3600,
            toLamport(50),
            [],
            [
              {
                revenueReceiver: revenueShareWalletAddress,
                shareBps: 1000,
              },
              {
                revenueReceiver: justiesClient.providerAddress,
                shareBps: 9000,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: AuctionCreationDisabled");

          await restoreConfigs(
            devEnv.justiesClient("authority"),
            originalGlobalStates
          );
        }
      );
    });
    describe("Non-exclusive auction use cases", () => {
      before(async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");
        const nftMintAddress = devEnv.getNft("Gods #1").mint.address;
        await justiesClient.createAuction(
          nftMintAddress,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          toLamport(50),
          [],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: justiesClient.providerAddress,
              shareBps: 9000,
            },
          ],
        );
      });

      describe("Auction initialized", () => {
        it("Check initial auction states", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const auction = await justiesClient.fetchLatestAuction();
          expect(auction.creator).to
            .deep.eq(devEnv.getJustiesPayerAddress("auctionCreator"));
          expect(auction.totalBids.toNumber()).to.eq(0);
          expect(auction.topBid.toNumber()).to.eq(0);
          expect(auction.topBidder).to.null;
          expect(auction.status).to.deep.eq({"inProgress": {}});
        });
        it("Check initial nft ownership", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const nftMintAddress = devEnv.getNft("Gods #1").mint.address;
          const auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const creatorNftTokenAccount = await devEnv.getSplTokenAccount(
            devEnv.getNftAta(
              "auctionCreator",
              "Gods #1"
            ));
          const lotEscrowAccount = await devEnv.getSplTokenAccount(
            justiesClient.findPdaLotEscrow(auctionAddress));

          expect(creatorNftTokenAccount.mint).to.deep.eq(nftMintAddress);
          expect(creatorNftTokenAccount.owner).to
            .deep.eq(devEnv.getJustiesPayerAddress("auctionCreator"));
          expect(creatorNftTokenAccount.amount).to.eq(BigInt(0));

          expect(lotEscrowAccount.mint).to.deep.eq(nftMintAddress);
          expect(lotEscrowAccount.owner).to
            .deep.eq(justiesClient.findPdaAuction(auction.id));
          expect(lotEscrowAccount.amount).to.eq(BigInt(1));
        });
      });

      describe("Auction in progress", () => {
        async function checkBidsIndex(
          auctionAddress: PublicKey,
          expectedBidders: string[]
        ) {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const indexPage = await justiesClient.fetchBidsIndexPage(
            auctionAddress,
            0
          );
          const expectedBidAddresses = [];
          expectedBidders.forEach(bidderName => {
            expectedBidAddresses.push(justiesClient.findPdaAuctionBid(
              auctionAddress,
              devEnv.justiesClient(bidderName).providerAddress
            ));
          });
          expect(indexPage.keys).to.eql(expectedBidAddresses);
        }

        it("Error - invalid max_allowed_bid_amount.", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Error case: the maxi_allowed_bid_amount is less than the bid amount.
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(49),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.be.rejectedWith("Error Code: InvalidBidAmount");
        });
        it("Error - less than start bid.", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Error case: the bid amount is less than the start_bid.
          // Expect to get error code 0x1 (NotMetStartBid).
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(49),
            toLamport(49),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.be.rejectedWith("Error Code: NotMetStartBid");
        });
        it("Error - insufficient bidding funds.", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Error case: the bid amount is less than the start_bid.
          // Expect to get error code 0x2 (InsufficientBidFunds).
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(11000),
            toLamport(11000),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.be.rejectedWith("Error Code: InsufficientBidFunds");
        });
        it("Error - creator makes bid", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const auction = await justiesClient.fetchLatestAuction();
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.be
            .rejectedWith("Error Code: AuctionCreatorCannotMakeBid");
        });
        it("bidder1 makes the first bid.", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          let auction = await justiesClient.fetchLatestAuction();
          const previousExpirationTime = auction.expiredTimestamp.toNumber();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const bidAddress = justiesClient.findPdaAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          const bidderTokenAccount = devEnv.getTokenAta("bidder1", "USDT");
          const previousBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            bidderTokenAccount
          );
          await justiesClient.makeBid(
            auction.id,
            toLamport(60),
            toLamport(60),
            null,
            auction.currencyTokenMintAddress,
          );

          await checkBidsIndex(auctionAddress, ["bidder1"]);

          const bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          // Reload auction states and the bidder token states.
          auction = await justiesClient.fetchLatestAuction();
          const currentBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            bidderTokenAccount);

          // Checks that the auction states are updated as expected.
          expect(auction.expiredTimestamp.toNumber()).to
            .eq(previousExpirationTime);
          expect(auction.totalBids.toNumber()).to.eq(1);
          expect(auction.topBid.toNumber()).to.eq(toLamport(60));
          expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);

          // Checks that the bid states are updated as expected.
          expect(bid.initialized).to.be.true;
          expect(bid.auction).to.deep.eq(auctionAddress);
          expect(bid.bidder).to.deep.eq(justiesClient.providerAddress);
          expect(bid.bid.toNumber()).to.eq(toLamport(60));
          expect(bid.latestChangeTimestamp.toNumber()).to
            .gte(auction.createdTimestamp.toNumber()).and
            .lte(auction.expiredTimestamp.toNumber());

          // Checks that the tokens are transferred as expected.
          const bidEscrowTokenAccountStates = await devEnv.getSplTokenAccount(
            justiesClient.findPdaBidEscrow(
              auctionAddress,
              justiesClient.providerAddress,
            ));
          expect(bidEscrowTokenAccountStates.mint).to.deep
            .eq(auction.currencyTokenMintAddress);
          expect(bidEscrowTokenAccountStates.owner).to.deep.eq(bidAddress);
          expect(Number(bidEscrowTokenAccountStates.amount)).to.deep
            .eq(toLamport(60));
          expect(Number(previousBidderTokenAccountStates.amount) -
            Number(currentBidderTokenAccountStates.amount)).to
            .eq(toLamport(60));
        });

        it("Error - minimum overbid rate unreached.", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          const auction = await justiesClient.fetchLatestAuction();

          // Error case 0: bidder2 made a bid lower than the current max bid.
          expect(justiesClient.makeBid(
            auction.id,
            toLamport(55),
            toLamport(55),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.rejectedWith("Error Code: NotMetMinOutbidRate");

          // Error case 1: bidder2 made a bid lower than the specified minimum
          // overbid rate.
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(61),
            toLamport(61),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.rejectedWith("Error Code: NotMetMinOutbidRate");
        });

        it("bidder2 makes the bid", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          let auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const bidAddress = justiesClient.findPdaAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          const previousBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder2", "USDT")
          );

          await justiesClient.makeBid(
            auction.id,
            toLamport(65),
            toLamport(65),
            null,
            auction.currencyTokenMintAddress,
          );

          await checkBidsIndex(auctionAddress, ["bidder1", "bidder2"]);

          auction = await justiesClient.fetchLatestAuction();
          const bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          const currentBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder2", "USDT")
          );
          expect(auction.totalBids.toNumber()).to.eq(2);
          expect(auction.topBid.toNumber()).to.eq(toLamport(65));
          expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);
          expect(bid.bid.toNumber()).to.eq(toLamport(65));
          expect(bid.bidder).to.deep.eq(justiesClient.providerAddress);

          const bidEscrowTokenAccountStates = await devEnv.getSplTokenAccount(
            justiesClient.findPdaBidEscrow(
              auctionAddress,
              justiesClient.providerAddress,
            ));
          expect(bidEscrowTokenAccountStates.owner).to.deep.eq(bidAddress);
          expect(Number(bidEscrowTokenAccountStates.amount)).to.deep
            .eq(toLamport(65));
          expect(Number(previousBidderTokenAccountStates.amount) -
            Number(currentBidderTokenAccountStates.amount)).to
            .eq(toLamport(65));
        });

        it("bidder1 makes the second bid.", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          let auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const bidderTokenAccountAddress = devEnv.getTokenAta(
            "bidder1",
            "USDT"
          );
          const bidEscrowTokenAccountAddress = justiesClient.findPdaBidEscrow(
            auctionAddress,
            justiesClient.providerAddress
          );
          const previousBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            bidderTokenAccountAddress
          );
          const previousBidEscrowTokenAccountStates = await devEnv.getSplTokenAccount(
            bidEscrowTokenAccountAddress
          );

          await justiesClient.makeBid(
            auction.id,
            toLamport(70),
            toLamport(70),
            null,
            auction.currencyTokenMintAddress,
          );

          await checkBidsIndex(auctionAddress, ["bidder1", "bidder2"]);

          auction = await justiesClient.fetchLatestAuction();
          const bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );

          expect(auction.totalBids.toNumber()).to.eq(2);
          expect(auction.topBid.toNumber()).to.eq(toLamport(70));
          expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);
          expect(bid.bid.toNumber()).to.eq(toLamport(70));
          expect(bid.bidder).to.deep.eq(justiesClient.providerAddress);

          const currentBidderTokenAccountStates = await devEnv.getSplTokenAccount(
            bidderTokenAccountAddress
          );
          const currentBidEscrowTokenAccountStates = await devEnv.getSplTokenAccount(
            bidEscrowTokenAccountAddress
          );
          expect(Number(currentBidEscrowTokenAccountStates.amount)).to
            .eq(toLamport(70));
          // Checks that the delta amount matches on bidder & escrow token
          // accounts.
          expect(Number(previousBidderTokenAccountStates.amount) -
            Number(currentBidderTokenAccountStates.amount)).to.eq(
            Number(currentBidEscrowTokenAccountStates.amount) -
            Number(previousBidEscrowTokenAccountStates.amount)
          );
        });

        it("bidder4 makes the second bid with slippage setting.", async () => {
          const justiesClient = devEnv.createJustiesClient("bidder4");
          await devEnv.airdrop("bidder4", 100);
          await devEnv.mintTokens("bidder4", "USDT", 10000);
          let auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);

          // Current minimum overbid rate is 5%, which result in the minimum bid
          // to be 73.5 USDT, which falls between the bid amount and the max
          // bid amount (i.e.: user's bid slippage tolerance). The final bid
          // would be 73.5 USDT.
          await justiesClient.makeBid(
            auction.id,
            toLamport(72),
            toLamport(75),
            null,
            auction.currencyTokenMintAddress,
          );

          await checkBidsIndex(auctionAddress, ["bidder1", "bidder2"]);

          auction = await justiesClient.fetchLatestAuction();
          const bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );

          expect(auction.totalBids.toNumber()).to.eq(3);
          expect(auction.topBid.toNumber()).to.eq(toLamport(73.5));
          expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);
          expect(bid.bid.toNumber()).to.eq(toLamport(73.5));
          expect(bid.bidder).to.deep.eq(justiesClient.providerAddress);
        });

        it("bidding in the last minutes causes auto extension.", async () => {
          const authorityJustiesClient = devEnv.justiesClient("authority");
          const justiesClient = devEnv.justiesClient("bidder1");
          let auction = await justiesClient.fetchLatestAuction();
          const globalStates = await justiesClient.fetchGlobalStates();
          const autoExtendTimeWindow = globalStates.lastMinutesForAuctionExtend *
            60;
          const extendTime = globalStates.auctionExtendMinutes * 60;
          const previousExpirationTime = auction.expiredTimestamp.toNumber();
          // The mock timestamp falls into the middle of the auto-extension
          // window which will trigger auto extension.
          const mockTimestamp = previousExpirationTime -
            Math.trunc(autoExtendTimeWindow / 2);

          await authorityJustiesClient.setMockTimestamp(new BN(mockTimestamp));
          await justiesClient.makeBid(
            auction.id,
            toLamport(80),
            toLamport(80),
            null,
            auction.currencyTokenMintAddress,
          );
          await authorityJustiesClient.clearMockTimestamp();

          auction = await justiesClient.fetchLatestAuction();
          expect(auction.topBid.toNumber()).to.eq(toLamport(80));
          expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);

          // Checks that the auction has been automatically extended.
          const currentExpirationTime = auction.expiredTimestamp.toNumber();
          expect(currentExpirationTime).to.eq(mockTimestamp + extendTime);
        });

        it("check bid index", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const auctionId = await justiesClient.latestAuctionId();
          expect(await generatorToList(
            justiesClient.getAuctionBids(auctionId))).to.containSubset([
            {
              bidder: devEnv.justiesClient("bidder1").providerAddress,
              bid: new BN(toLamport(80)),
            },
            {
              bidder: devEnv.justiesClient("bidder2").providerAddress,
              bid: new BN(toLamport(65)),
            },
            {
              bidder: devEnv.justiesClient("bidder4").providerAddress,
              bid: new BN(toLamport(73.5)),
            },
          ]);
        });

        it("Error - make bid with invalid index page id", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          const auction = await justiesClient.fetchLatestAuction();
          expect(justiesClient.makeBid(
            auction.id,
            toLamport(90),
            toLamport(90),
            null,
            auction.currencyTokenMintAddress,
            undefined,
            undefined,
            0,
          )).to.eventually
            .rejectedWith("bid_index. Error Code: ConstraintSeeds");
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(90),
            toLamport(90),
            null,
            auction.currencyTokenMintAddress,
            undefined,
            undefined,
            2,
          )).to.eventually
            .rejectedWith("bid_index. Error Code: ConstraintSeeds");
        });

        it("Error - top-bidder cancels bid before finish", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auctionId = await justiesClient.latestAuctionId();
          return expect(justiesClient.cancelAuctionBid(auctionId)).to.eventually
            .be.rejectedWith(
              "Error Code: TopBidderCannotCancelBid"
            );
        });

        it("bidder4 cancels bid", async () => {
          const justiesClient = devEnv.justiesClient("bidder4");
          const auctionId = await justiesClient.latestAuctionId();
          const auctionAddress = justiesClient.findPdaAuction(auctionId);
          const bidEscrowAccountAddress = justiesClient.findPdaBidEscrow(
            auctionAddress,
            justiesClient.providerAddress
          );
          let bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          const bidAmount = bid.bid.toNumber();
          const previousTokenAmount = Number((await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder4", "USDT")
          )).amount);

          await justiesClient.cancelAuctionBid(auctionId);
          bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            justiesClient.providerAddress
          );
          // Expects the bid has been set to 0.
          expect(bid.bid.toNumber()).to.eq(0);
          // Expects that the bid escrow token account has been closed.
          expect(await devEnv.connection.getAccountInfo(bidEscrowAccountAddress)).to.be.null;
          // Expects that the token amount is correct after refunding.
          const currentTokenAmount = Number((await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder4", "USDT")
          )).amount);
          expect(currentTokenAmount).to.eq(previousTokenAmount + bidAmount);
        });

        it("Error - cancel bid multiple times before finish", async () => {
          const justiesClient = devEnv.justiesClient("bidder4");
          let auctionId = await justiesClient.latestAuctionId();
          // Expects to get AccountNotInitialized error as the bid escrow
          // account has been closed.
          return expect(justiesClient.cancelAuctionBid(auctionId)).to.eventually
            .be
            .rejectedWith(
              "bid_escrow_token_account. Error Code: AccountNotInitialized");
        });

        it("Error - claim lot before finish", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auctionId = await justiesClient.latestAuctionId();
          return expect(justiesClient.claimLotNft(auctionId)).to.eventually.be
            .rejectedWith("Error Code: OngoingAuction");
        });

        it("Error - claim revenue before finish", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const auctionId = await justiesClient.latestAuctionId();
          return expect(justiesClient.claimAuctionRevenue(auctionId)).to
            .eventually.be.rejectedWith("Error Code: OngoingAuction");
        });
      });

      describe("Auction finished", () => {
        const authorityJustiesClient = devEnv.justiesClient("authority");

        before(async () => {
          const auction = await authorityJustiesClient.fetchLatestAuction();
          // Set the mock timestamp to make the auction finished.
          await authorityJustiesClient.setMockTimestamp(auction.expiredTimestamp.addn(
            10));
        });

        after(async () => {
          await authorityJustiesClient.clearMockTimestamp();
        });

        it("Error - non-winner claiming lot", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          const auctionId = await justiesClient.latestAuctionId();
          return expect(justiesClient.claimLotNft(auctionId)).to.eventually.be
            .rejectedWith(
              "Error Code: IneligibleToClaimLotNft"
            );
        });

        it("Error - winner cancels bid", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auctionId = await justiesClient.latestAuctionId();
          return expect(justiesClient.cancelAuctionBid(auctionId)).to.eventually
            .be.rejectedWith(
              "Error Code: TopBidderCannotCancelBid"
            );
        });

        it("Claiming lot", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          let auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const bidderNftAccountAddress = devEnv.getNftAta(
            "bidder1",
            "Gods #1"
          );
          const lotEscrowAccountAddress = justiesClient.findPdaLotEscrow(
            auctionAddress);
          const previousCreatorBalance = await devEnv.balanceOf("auctionCreator");
          // Although the auction is expired, the status is yet to be set to
          // finished by txns.
          expect(auction.status).to.deep.eq({"inProgress": {}});

          await justiesClient.claimLotNft(auction.id);

          auction = await justiesClient.fetchLatestAuction();
          // Expects that the auction status to be set to "finished".
          expect(auction.status).to.deep.eq({"finished": {}});
          // Expects the escrow account to be closed.
          expect(await devEnv.connection.getAccountInfo(lotEscrowAccountAddress)).to.be.null;
          // Expects that the NFT token to be transferred successfully.
          const bidderNftAccount = await devEnv.getSplTokenAccount(
            bidderNftAccountAddress);
          expect(Number(bidderNftAccount.amount)).to.eq(1);
          // As the NFT lot escrow account is closed after being claimed, the
          // account rent is refunded to the account creator (i.e.: the auction
          // creator here).
          expect(await devEnv.balanceOf("auctionCreator")).to
            .gt(previousCreatorBalance);
        });

        it("Error - claiming lot NFT multiple times", async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          let auctionId = await justiesClient.latestAuctionId();
          // Expects to get AccountNotInitialized error as the lot escrow
          // account has been closed.
          return expect(justiesClient.claimLotNft(auctionId)).to.eventually.be
            .rejectedWith(
              "lot_escrow_nft_account. Error Code: AccountNotInitialized");
        });

        it("Cancelling", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          const bidderAddress = justiesClient.providerAddress;
          const auctionId = await justiesClient.latestAuctionId();
          const auctionAddress = justiesClient.findPdaAuction(auctionId);
          const bidAmount = (await justiesClient.fetchAuctionBid(
            auctionAddress,
            bidderAddress
          )).bid.toNumber();
          const bidEscrowAccountAddress = justiesClient.findPdaBidEscrow(
            auctionAddress,
            bidderAddress,
          );
          const previousTokenAmount = Number((await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder2", "USDT")
          )).amount);

          await justiesClient.cancelAuctionBid(auctionId);

          // Expects that the bid escrow token account has been closed.
          expect(await devEnv.connection.getAccountInfo(bidEscrowAccountAddress)).to.be.null;
          // Expects that the token amount is correct after refunding.
          const currentTokenAmount = Number((await devEnv.getSplTokenAccount(
            devEnv.getTokenAta("bidder2", "USDT")
          )).amount);
          expect(currentTokenAmount).to.eq(previousTokenAmount + bidAmount);
        });

        it("Error - cancelling bid multiple times", async () => {
          const justiesClient = devEnv.justiesClient("bidder2");
          let auctionId = await justiesClient.latestAuctionId();
          // Expects to get AccountNotInitialized error as the bid escrow
          // account has been closed.
          return expect(justiesClient.cancelAuctionBid(auctionId)).to.eventually
            .be
            .rejectedWith(
              "bid_escrow_token_account. Error Code: AccountNotInitialized");
        });

        it("Claiming revenue", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          const auction = await justiesClient.fetchLatestAuction();
          const auctionAddress = justiesClient.findPdaAuction(auction.id);
          const topBidderAddress = auction.topBidder;
          const bidEscrowAccountAddress = justiesClient.findPdaBidEscrow(
            auctionAddress,
            topBidderAddress
          );
          const bid = await justiesClient.fetchAuctionBid(
            auctionAddress,
            topBidderAddress
          );
          const totalRevenue = bid.bid.toNumber();
          const feeRateBps = (await justiesClient.fetchGlobalStates()).marketFeeRateBps;
          const expectedFee = Math.trunc(totalRevenue * feeRateBps / 10000);
          // The auction was created with 10% to revenue share wallet & 90% to
          // creator's wallet.
          const expectedSharedRevenue = Math.trunc((totalRevenue -
            expectedFee) / 10);
          const expectedCreatorRevenue = Math.trunc((totalRevenue -
            expectedFee) * 9 / 10);
          const previousBalance = await devEnv.balanceOf("bidder1");
          const previousFeeAmount = await devEnv.ataTokenAmount(
            feeTreasuryAddress,
            "USDT"
          );
          const previousRevenueShareAmount = await devEnv.ataTokenAmount(
            revenueShareWalletAddress,
            "USDT"
          );
          const previousTokenAmount = await devEnv.ataTokenAmount(
            "auctionCreator",
            "USDT"
          );

          await justiesClient.claimAuctionRevenue(auction.id);

          // Expects that the bid escrow token account has been closed.
          expect(await devEnv.connection.getAccountInfo(bidEscrowAccountAddress)).to.be.null;
          // Expects that the bidder's SOL balance increased due to the rent
          // refund from the closed bid escrow account.
          const currentBalance = await devEnv.balanceOf("bidder1");
          expect(currentBalance).to.gt(previousBalance);
          // Expects that all the fees & revenues are distributed correctly.
          const currentFeeAmount = await devEnv.ataTokenAmount(
            feeTreasuryAddress,
            "USDT"
          );
          const currentRevenueShareAmount = await devEnv.ataTokenAmount(
            revenueShareWalletAddress,
            "USDT"
          );
          const currentTokenAmount = await devEnv.ataTokenAmount(
            "auctionCreator",
            "USDT"
          );
          expect(currentFeeAmount).to.eq(previousFeeAmount + expectedFee);
          expect(currentRevenueShareAmount).to
            .eq(previousRevenueShareAmount + expectedSharedRevenue);
          expect(currentTokenAmount).to
            .eq(previousTokenAmount + expectedCreatorRevenue);
        });

        it("Error - claiming revenue multiple times", async () => {
          const justiesClient = devEnv.justiesClient("auctionCreator");
          let auctionId = await justiesClient.latestAuctionId();
          // Expects to get AccountNotInitialized error as the bid escrow
          // account has been closed.
          return expect(justiesClient.claimAuctionRevenue(auctionId)).to
            .eventually
            .be
            .rejectedWith(
              "bid_escrow_token_account. Error Code: AccountNotInitialized");
        });
      });
    });
    describe("Exclusive auction use cases", () => {
      before(async () => {
        const justiesClient = devEnv.justiesClient("auctionCreator");
        const nftMintAddress = devEnv.getNft("justs #1").mint.address;
        await justiesClient.createAuction(
          nftMintAddress,
          devEnv.getTokenMintAddress("USDC"),
          24 * 3600,
          toLamport(50),
          [
            {
              groupType: {nftHolderGroup: {}},
              key: devEnv.getNftCollection("justs").address,
            },
            {
              groupType: {tokenHolderGroup: {}},
              key: devEnv.getTokenMintAddress("USDT"),
            },
          ],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: justiesClient.providerAddress,
              shareBps: 9000,
            },
          ],
        );
      });

      it(
        "Error - invalid bid without eligibility check account payloads",
        async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Both of the bids will be rejected due to empty account payloads.
          expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            auction.currencyTokenMintAddress,
          )).to.eventually.be
            .rejectedWith("Error Code: NotEnoughPayloadAccounts");

          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            {
              groupType: {tokenHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            auction.currencyTokenMintAddress,
          )).to.eventually.be
            .rejectedWith("Error Code: NotEnoughPayloadAccounts");
        }
      );

      it(
        "Error - invalid bid with inconsistent token & metadata account payloads",
        async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Expects the bid to be rejected as the token account and the
          // metadata don't match.
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            auction.currencyTokenMintAddress,
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("bidder1", "justs #3"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("Gods #1").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );

      it(
        "Error - invalid bid with NFT token metadata without collection info",
        async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();
          // Expects the bid to be rejected as the NFT token doesn't have
          // collection info.
          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            auction.currencyTokenMintAddress,
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("bidder1", "Standalone #1"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("Standalone #1").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );

      it("Error - invalid bid with unowned token account", async () => {
        // Note that bidder3 doesn't own any tokens.
        const justiesClient = devEnv.justiesClient("bidder3");
        const auction = await justiesClient.fetchLatestAuction();
        // Expects the bid to be rejected as bidder3 doesn't own USDT.
        return expect(justiesClient.makeBid(
          auction.id,
          toLamport(50),
          toLamport(50),
          {
            groupType: {tokenHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getTokenAta("bidder1", "USDT"),
              isWritable: false,
              isSigner: false,
            },
          ],
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
      });

      it("Error - invalid bid with unowned nft account", async () => {
        // Note that bidder3 doesn't own any tokens.
        const justiesClient = devEnv.justiesClient("bidder3");
        const auction = await justiesClient.fetchLatestAuction();
        // Expects the bid to be rejected as bidder3 doesn't own "justs #3".
        return expect(justiesClient.makeBid(
          auction.id,
          toLamport(50),
          toLamport(50),
          {
            groupType: {nftHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getNftAta("bidder1", "justs #3"),
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: devEnv.getNft("justs #3").metadataAddress,
              isWritable: false,
              isSigner: false,
            },
          ],
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
      });

      it(
        "Error - ineligible bid with empty eligibility check input",
        async () => {
          const justiesClient = devEnv.justiesClient("bidder1");
          const auction = await justiesClient.fetchLatestAuction();

          return expect(justiesClient.makeBid(
            auction.id,
            toLamport(50),
            toLamport(50),
            null,
            auction.currencyTokenMintAddress,
          )).to.eventually.be.rejectedWith("Error Code: Ineligible");
        }
      );

      it("Error - ineligible bid with ineligible token account", async () => {
        const justiesClient = devEnv.justiesClient("bidder1");
        const auction = await justiesClient.fetchLatestAuction();
        // Expects the bid to be rejected as USDC is not eligible for the bid.
        return expect(justiesClient.makeBid(
          auction.id,
          toLamport(50),
          toLamport(50),
          {
            groupType: {tokenHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getTokenAta("bidder1", "USDC"),
              isWritable: false,
              isSigner: false,
            },
          ],
        )).to.eventually.be.rejectedWith("Error Code: Ineligible");
      });

      it("Error - ineligible bid with ineligible nft account", async () => {
        const justiesClient = devEnv.justiesClient("bidder1");
        const auction = await justiesClient.fetchLatestAuction();
        // Expects the bid to be rejected as Gods is not eligible for the bid.
        return expect(justiesClient.makeBid(
          auction.id,
          toLamport(50),
          toLamport(50),
          {
            groupType: {tokenHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getNftAta("bidder1", "Gods #3"),
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: devEnv.getNft("Gods #3").metadataAddress,
              isWritable: false,
              isSigner: false,
            },
          ],
        )).to.eventually.be.rejectedWith("Error Code: Ineligible");
      });

      it("bidder1 makes bid with eligible NFT account", async () => {
        const justiesClient = devEnv.justiesClient("bidder1");
        let auction = await justiesClient.fetchLatestAuction();

        // The bid will be accepted as bidder1 holds justs.
        await justiesClient.makeBid(
          auction.id,
          toLamport(50),
          toLamport(50),
          {
            groupType: {nftHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getNftAta("bidder1", "justs #3"),
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: devEnv.getNft("justs #3").metadataAddress,
              isWritable: false,
              isSigner: false,
            },
          ],
        );

        auction = await justiesClient.fetchLatestAuction();
        expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);
        expect(auction.topBid.toNumber()).to.eq(toLamport(50));
      });

      it("bidder2 makes bid with eligible token account", async () => {
        const justiesClient = devEnv.justiesClient("bidder2");
        let auction = await justiesClient.fetchLatestAuction();

        // The bid will be accepted as bidder2 holds USDT.
        await justiesClient.makeBid(
          auction.id,
          toLamport(60),
          toLamport(60),
          {
            groupType: {tokenHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          auction.currencyTokenMintAddress,
          undefined,
          [
            {
              pubkey: devEnv.getTokenAta("bidder2", "USDT"),
              isWritable: false,
              isSigner: false,
            },
          ],
        );

        auction = await justiesClient.fetchLatestAuction();
        expect(auction.topBidder).to.deep.eq(justiesClient.providerAddress);
        expect(auction.topBid.toNumber()).to.eq(toLamport(60));
      });
    });
    describe("Cancel auction", () => {
      let justiesClient: JustiesProgramClient;
      let auctionId: BN;
      before(async () => {
        justiesClient = devEnv.justiesClient("bidder1");
        await justiesClient.createAuction(
          devEnv.getNft("Gods #3").address,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          toLamport(50),
          [],
          [
            {
              revenueReceiver: justiesClient.providerAddress,
              shareBps: 10000,
            },
          ],
        );
        auctionId = await justiesClient.latestAuctionId();
      });

      it("Error - non-creator tries to cancel the auction", async () => {
        return expect(devEnv.justiesClient("bidder2").cancelAuction(auctionId))
          .to.eventually.be.rejectedWith("Error Code: NotAuctionCreator");
      });

      it("Cancels when there are no bids", async () => {
        await justiesClient.cancelAuction(auctionId);
        // Expects the auction status is cancelled.
        const auction = await justiesClient.fetchLatestAuction();
        const auctionAddress = justiesClient.findPdaAuction(auction.id);
        expect(auction.status).to.eql({cancelled: {}});
        // Expects the NFT has been returned.
        const creatorNftAccount = await devEnv.getSplTokenAccount(devEnv.getNftAta(
          "bidder1",
          "Gods #3"
        ));
        expect(Number(creatorNftAccount.amount)).to.eq(1);
        // Expects the lot escrow nft account has been closed.
        const lotEscrowAddress = justiesClient.findPdaLotEscrow(auctionAddress);
        expect(await devEnv.connection.getAccountInfo(
          lotEscrowAddress)).to.be.null;
      });
      it("Error - makes bid on a cancelled auction", async () => {
        return expect(devEnv.justiesClient("bidder2").makeBid(
          auctionId,
          toLamport(50),
          toLamport(50),
          null,
          devEnv.getTokenMintAddress("USDT")
        )).to.eventually.be.rejectedWith("Error Code: AuctionCancelled");
      });
      it("Error - not cancellable with any bids", async () => {
        await justiesClient.createAuction(
          devEnv.getNft("Gods #3").address,
          devEnv.getTokenMintAddress("USDT"),
          24 * 3600,
          toLamport(50),
          [],
          [
            {
              revenueReceiver: justiesClient.providerAddress,
              shareBps: 10000,
            },
          ],
        );
        auctionId = await justiesClient.latestAuctionId();

        await devEnv.justiesClient("bidder2").makeBid(
          auctionId,
          toLamport(50),
          toLamport(50),
          null,
          devEnv.getTokenMintAddress("USDT")
        );

        return expect(justiesClient.cancelAuction(auctionId))
          .to.eventually.be.rejectedWith("Error Code: AuctionNotCancelable");
      });
    });
  });

  describe("Raffle", () => {
    let raffleCreatorClient: JustiesProgramClient;
    let ticketBuyer1Client: JustiesProgramClient;
    let ticketBuyer2Client: JustiesProgramClient;
    let ticketBuyer3Client: JustiesProgramClient;
    let ticketBuyer4Client: JustiesProgramClient;

    before(async () => {
      await setupJustiesRaffleTestAccounts(devEnv);
      raffleCreatorClient = devEnv.justiesClient("raffleCreator");
      ticketBuyer1Client = devEnv.justiesClient("ticketBuyer1");
      ticketBuyer2Client = devEnv.justiesClient("ticketBuyer2");
      ticketBuyer3Client = devEnv.justiesClient("ticketBuyer3");
      ticketBuyer4Client = devEnv.justiesClient("ticketBuyer4");
    });

    // A helper function for creating test raffle.
    async function createTestRaffle(
      nftName?: string,
      currencyToken?: string,
      duration?: number,
      ticketSupply?: number,
      numRaffledNfts?: number,
      revenueShares?: RevenueShareConfig[],
      creatorNftAccount?: PublicKey,
      ticketPrice?: number,
    ) {
      if (nftName === undefined) {
        nftName = "Gift Card #1";
      }
      if (currencyToken === undefined) {
        currencyToken = "USDT";
      }
      if (duration === undefined) {
        duration = 24 * 3600;
      }
      if (ticketSupply === undefined) {
        ticketSupply = 1000;
      }
      if (numRaffledNfts === undefined) {
        numRaffledNfts = 2;
      }
      if (revenueShares === undefined) {
        revenueShares = [
          {
            revenueReceiver: revenueShareWalletAddress,
            shareBps: 1000,
          },
          {
            revenueReceiver: raffleCreatorClient.providerAddress,
            shareBps: 9000,
          },
        ];
      }
      if (ticketPrice === undefined) {
        ticketPrice = toLamport(5);
      }
      await raffleCreatorClient.createRaffle(
        devEnv.getNft(nftName).address,
        devEnv.getTokenMintAddress(currencyToken),
        duration,
        ticketSupply,
        ticketPrice,
        numRaffledNfts,
        [],
        revenueShares,
        creatorNftAccount,
      );
    }

    describe("Creation error handling", () => {
      it("Error - create raffle with invalid duration", async () => {
        // Error case: duration too short;
        expect(createTestRaffle(
          undefined,
          undefined,
          3600,
          undefined,
          undefined
        )).to.eventually.be.rejectedWith("Error Code: InvalidRaffleDuration");
        // Error case: duration too long;
        return expect(createTestRaffle(
          undefined,
          undefined,
          10 * 24 * 3600,
          undefined,
          undefined
        )).to.eventually.be.rejectedWith("Error Code: InvalidRaffleDuration");
      });

      it("Error - create raffle with invalid ticket supply", async () => {
        // Error case: ticket supply too small;
        expect(createTestRaffle(
          undefined,
          undefined,
          undefined,
          10,
          undefined
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidRaffleTicketSupply");
        // Error case: ticket supply too large;
        return expect(createTestRaffle(
          undefined,
          undefined,
          undefined,
          10000,
          undefined
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidRaffleTicketSupply");
      });

      it("Error - create raffle with invalid num raffled nfts", async () => {
        // Error case: num raffled nfts is 0;
        expect(createTestRaffle(
          "Gift Card #2",
          undefined,
          undefined,
          undefined,
          0
        )).to.eventually.be.rejectedWith("Error Code: InvalidNumRaffledNfts");
        // Error case: num raffled nfts is too large;
        return expect(createTestRaffle(
          "Gift Card #2",
          undefined,
          undefined,
          undefined,
          30
        )).to.eventually.be.rejectedWith("Error Code: InvalidNumRaffledNfts");

      });
      it("Error - create raffle with unsupported currency token", async () => {
        // Error case: creates raffle with a currency token that is not in the
        // allowlist.
        return expect(createTestRaffle(
          undefined,
          "FOO",
          undefined,
          undefined,
          undefined,
        )).to.eventually.be.rejectedWith(
          "token_allowlist_states. Error Code: AccountNotInitialized");
      });
      it("Error - create raffle with unsupported nft", async () => {
        // Error case: creates raffle with unsupported NFT collections.
        return expect(createTestRaffle(
          "Bar #2",
          undefined,
          undefined,
          undefined,
          1,
        )).to.eventually.be.rejectedWith(
          "nft_allowlist_states. Error Code: AccountNotInitialized");
      });
      it("Error - create raffle with unowned nft", async () => {
        // Error case: creates a raffle with NFT owned by someone else.
        return expect(createTestRaffle(
          "Gods #4",
          undefined,
          undefined,
          undefined,
          1,
          undefined,
          devEnv.getNftAta("ticketBuyer1", "Gods #4"),
        )).to.eventually.be
          .rejectedWith("Error Code: InvalidRaffleCreatorNftAccount");
      });
      it("Error - create raffle with insufficient nft amount", async () => {
        // Error case: the raffleCreator only has 2 "Gift Card #1" SFT, but
        // tries to raffle 3 of them.
        return expect(createTestRaffle(
          undefined,
          undefined,
          undefined,
          undefined,
          3,
        )).to.eventually.be.rejectedWith("Error Code: InvalidNftMint");
      });
      it(
        "Error - create raffle with incorrect revenue share config",
        async () => {
          // Error case: revenue share config is empty;
          expect(createTestRaffle(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            [],
            undefined,
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");
          // Error case: the sum of revenue shares > 100%;
          expect(createTestRaffle(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            [
              {
                revenueReceiver: revenueShareWalletAddress,
                shareBps: 3000,
              },
              {
                revenueReceiver: raffleCreatorClient.providerAddress,
                shareBps: 8000,
              },
            ],
            undefined,
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");
          // Error case: the sum of revenue shares < 100%;
          return expect(createTestRaffle(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            [
              {
                revenueReceiver: revenueShareWalletAddress,
                shareBps: 1000,
              },
              {
                revenueReceiver: raffleCreatorClient.providerAddress,
                shareBps: 2000,
              },
            ],
            undefined,
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRevenueShareConfig");
        }
      );
      it("Error - create raffle when raffle creation is disabled", async () => {
        const authority = devEnv.justiesClient("authority");
        const originalGlobalStates = await authority.fetchGlobalStates();

        // Disables raffle creation.
        const updateConfigsInput = JustiesProgramClient.getDefaultUpdateConfigsInput();
        updateConfigsInput.raffleCreationEnabled = false;
        await authority.updateConfigs(updateConfigsInput);

        await expect(createTestRaffle()).to.eventually.be.rejectedWith(
          "Error Code: RaffleCreationDisabled",
        );
        await restoreConfigs(authority, originalGlobalStates);
      });
    });
    describe("Non-exclusive raffle use cases", () => {
      before(async () => {
        await createTestRaffle();
      });

      describe("Raffle initialized", () => {
        it("Check initial raffle states", async () => {
          const raffle = await raffleCreatorClient.fetchLatestRaffle();
          expect(raffle.nftMintAddress).to
            .eql(devEnv.getNft("Gift Card #1").address);
          expect(raffle.numRaffledNfts).to.eq(2);
          expect(raffle.currencyTokenMintAddress).to
            .eql(devEnv.getTokenMintAddress("USDT"));
          expect(raffle.createdTimestamp.toNumber() + 24 * 3600).to
            .eq(raffle.expiredTimestamp.toNumber());
          expect(raffle.ticketSupply).to.eq(1000);
          expect(raffle.ticketPrice.toNumber()).to.eq(toLamport(5));
          expect(raffle.ticketSold).to.eq(0);
          expect(raffle.creator).to.eql(raffleCreatorClient.providerAddress);
          expect(raffle.eligibleGroups).to.eql([]);
          expect(raffle.revenueShares).to.eql([
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: raffleCreatorClient.providerAddress,
              shareBps: 9000,
            },
          ]);
          expect(raffle.status).to.eql({inProgress: {}});
          expect(raffle.winnerIds).to.eql([]);
          expect(raffle.claimMask.toNumber()).to.eq(0);
        });

        it("Check initial nft ownership", async () => {
          const raffle = await raffleCreatorClient.fetchLatestRaffle();
          const raffleAddress = raffleCreatorClient.findPdaRaffle(raffle.id);
          const creatorNftAccountAddress = devEnv.getNftAta(
            "raffleCreator",
            "Gift Card #1"
          );
          const raffleNftEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
            raffleAddress);

          const creatorNftAccount = await devEnv.getSplTokenAccount(
            creatorNftAccountAddress);
          const raffleNftEscrowAccount = await devEnv.getSplTokenAccount(
            raffleNftEscrowAddress);

          // Expects that the NFTs are transferred as expected.
          expect(creatorNftAccount.mint).to.eql(raffle.nftMintAddress);
          expect(creatorNftAccount.owner).to
            .eql(raffleCreatorClient.providerAddress);
          expect(Number(creatorNftAccount.amount)).to.eq(0);
          expect(raffleNftEscrowAccount.mint).to.eql(raffle.nftMintAddress);
          expect(raffleNftEscrowAccount.owner).to.eql(raffleAddress);
          expect(Number(raffleNftEscrowAccount.amount)).to.eq(2);
        });
      });

      describe("Raffle in progress", () => {
        let raffleId: BN;
        let raffleAddress: PublicKey;

        // A helper method for testing ticket buying.
        async function testBuyTicket(
          client: JustiesProgramClient,
          numTickets: number,
          expectedTotalNumTickets: number
        ) {
          let raffle = await client.fetchRaffle(raffleId);
          const previousTicketsSold = raffle.ticketSold;
          const raffleRevenueEscrowAddress = client.findPdaRaffleRevenueEscrow(
            raffleAddress);
          const expectedTicketCost = numTickets * raffle.ticketPrice.toNumber();
          const previousBuyerTokenAmount = (await devEnv.ataTokenAmount(
            client.providerAddress,
            "USDT"
          ));
          const previousRaffleRevenue = Number((await devEnv.getSplTokenAccount(
            raffleRevenueEscrowAddress)).amount);

          // Buy tickets.
          await client.buyRaffleTickets(raffleId, numTickets, null);

          // Checks raffle.ticketSold
          raffle = await client.fetchRaffle(raffleId);
          expect(raffle.ticketSold - previousTicketsSold).to.eq(numTickets);

          // Checks ticket position account.
          const ticketPosition = await client.fetchRaffleTicketPosition(
            raffleAddress,
            client.providerAddress
          );
          expect(ticketPosition.buyer).to.eql(client.providerAddress);
          expect(ticketPosition.totalNumTickets).to.eq(expectedTotalNumTickets);

          // Checks the buyer & escrow token account balance change.
          const currentBuyerTokenAmount = (await devEnv.ataTokenAmount(
            client.providerAddress,
            "USDT"
          ));
          const currentRaffleRevenue = Number((await devEnv.getSplTokenAccount(
            raffleRevenueEscrowAddress)).amount);
          expect(previousBuyerTokenAmount - currentBuyerTokenAmount).to
            .eq(expectedTicketCost);
          expect(currentRaffleRevenue - previousRaffleRevenue).to
            .eq(expectedTicketCost);
        }

        before(async () => {
          raffleId = await ticketBuyer1Client.latestRaffleId();
          raffleAddress = ticketBuyer1Client.findPdaRaffle(raffleId);
        });

        it("Error - buys 0 tickets", async () => {
          return expect(ticketBuyer1Client.buyRaffleTickets(raffleId, 0, null))
            .to.eventually
            .rejectedWith("Error Code: InvalidRaffleTicketNumber");
        });

        it("Error - buys more tickets than total supply", async () => {
          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            1010,
            null
          )).to.eventually
            .rejectedWith("Error Code: InvalidRaffleTicketNumber");
        });

        it("Error - buys tickets with insufficient token balance", async () => {
          const ticketBuyer3Client = devEnv.justiesClient("ticketBuyer3");
          return expect(ticketBuyer3Client.buyRaffleTickets(
            raffleId,
            100,
            null
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidTicketBuyerTokenAccount");
        });

        it(
          "Error - buys tickets with uninitialized token account",
          async () => {
            return expect(ticketBuyer4Client.buyRaffleTickets(
              raffleId,
              1,
              null
            )).to.eventually.be
              .rejectedWith(
                "buyer_token_account. Error Code: AccountNotInitialized");
          }
        );

        it("Error - creator buys tickets", async () => {
          return expect(raffleCreatorClient.buyRaffleTickets(
            raffleId,
            1,
            null
          )).to.eventually.be
            .rejectedWith(
              "Error Code: RaffleCreatorCannotBuyTickets");
        });

        it("Buying tickets", async () => {
          await testBuyTicket(ticketBuyer1Client, 100, 100);
          await testBuyTicket(ticketBuyer2Client, 200, 200);
          await testBuyTicket(ticketBuyer3Client, 30, 30);
          expect(await generatorToList(
            raffleCreatorClient.getRaffleTicketPositions(raffleId))).to
            .containSubset([
              {
                buyer: ticketBuyer1Client.providerAddress,
                totalNumTickets: 100,
              },
              {
                buyer: ticketBuyer2Client.providerAddress,
                totalNumTickets: 200,
              },
              {
                buyer: ticketBuyer3Client.providerAddress,
                totalNumTickets: 30,
              },
            ]);

          const ticketPositionStats = await raffleCreatorClient.fetchRaffleTicketPositionStats(
            raffleAddress);
          expect(ticketPositionStats).to.containSubset({
            ticketPositions: [100, 200, 30],
          });
        });

        it(
          "Error - buys tickets with wrong ticket position index page id.",
          async () => {
            expect(ticketBuyer1Client.buyRaffleTickets(
              raffleId,
              10,
              null,
              undefined,
              undefined,
              0
            )).to.eventually.be
              .rejectedWith("ticket_position_index. Error Code: ConstraintSeeds");
            return expect(ticketBuyer1Client.buyRaffleTickets(
              raffleId,
              10,
              null,
              undefined,
              undefined,
              2
            )).to.eventually.be
              .rejectedWith("ticket_position_index. Error Code: ConstraintSeeds");
          }
        );

        it("Error - buys more ticket than the remaining supply", async () => {
          const raffle = await ticketBuyer1Client.fetchRaffle(raffleId);
          expect(raffle.ticketSupply - raffle.ticketSold).to.eq(670);
          // Buying more than the remaining tickets.
          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            671,
            null
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidRaffleTicketNumber");
        });

        it("Buying tickets for the second time", async () => {
          // Checks that the tickets number are incremented correctly in the
          // ticket position account.
          await testBuyTicket(ticketBuyer1Client, 10, 110);
          await testBuyTicket(ticketBuyer2Client, 20, 220);
          await testBuyTicket(ticketBuyer3Client, 3, 33);

          const ticketPositionStats = await raffleCreatorClient.fetchRaffleTicketPositionStats(
            raffleAddress);
          expect(ticketPositionStats).to.containSubset({
            ticketPositions: [110, 220, 33],
          });
        });

        it("Error - claim rewards before raffle finished", async () => {
          // Expects the claiming to be rejected with error code:
          // "RaffleNotMade"
          return expect(ticketBuyer1Client.claimRaffleReward(raffleId)).to.be
            .eventually.rejectedWith("Error Code: RaffleNotMade");
        });

        it("Error - claim revenue before raffle finished", async () => {
          // Expects the claiming to be rejected with error code:
          // "RaffleNotMade"
          return expect(raffleCreatorClient.claimRaffleRevenue(raffleId)).to.be
            .eventually.rejectedWith("Error Code: RaffleNotMade");
        });

        it("Error - set winners before raffle ended.", async () => {
          const authorityClient = devEnv.justiesClient("authority");
          return expect(authorityClient.setRaffleWinners(raffleId, [
            // ticketBuyer1
            0,
            // ticketBuyer 3
            2,
          ])).to.eventually.be.rejectedWith("Error Code: RaffleOngoing");
        });
      });

      describe("Raffle finished", () => {
        let authorityClient: JustiesProgramClient;
        let raffleId: BN;
        let raffleAddress: PublicKey;

        before(async () => {
          authorityClient = devEnv.justiesClient("authority");
          raffleId = await raffleCreatorClient.latestRaffleId();
          raffleAddress = raffleCreatorClient.findPdaRaffle(raffleId);
          const raffle = await raffleCreatorClient.fetchRaffle(raffleId);

          // Mock the timestamp to make the raffle end.
          await authorityClient.setMockTimestamp(raffle.expiredTimestamp.addn(10));
        });

        after(async () => {
          await authorityClient.clearMockTimestamp();
        });

        it(
          "Error - claim rewards after raffle end but before raffle made",
          async () => {
            // Expects the claiming to be rejected with error code:
            // "RaffleNotMade"
            return expect(ticketBuyer1Client.claimRaffleReward(raffleId)).to.be
              .eventually.rejectedWith("Error Code: RaffleNotMade");
          }
        );

        it(
          "Error - claim revenue after raffle end but before raffle made",
          async () => {
            // Expects the claiming to be rejected with error code:
            // "RaffleNotMade"
            return expect(raffleCreatorClient.claimRaffleRevenue(raffleId)).to
              .be
              .eventually.rejectedWith("Error Code: RaffleNotMade");
          }
        );

        it("Error - buys tickets after raffle end", async () => {
          // Rejected with error code: RaffleEnded
          return expect(ticketBuyer1Client.buyRaffleTickets(raffleId, 1, null))
            .to.eventually.be.rejectedWith("Error Code: RaffleEnded");
        });

        it("Error - non-authority user sets winners.", async () => {
          return expect(ticketBuyer1Client.setRaffleWinners(raffleId, [
            0, 1,
          ])).to.eventually.be.rejectedWith("Error Code: NotTheAuthority");
        });

        it("Sets winners", async () => {
          await authorityClient.setRaffleWinners(raffleId, [
            0, 2,
          ]);

          const raffle = await raffleCreatorClient.fetchRaffle(raffleId);
          expect(raffle.status).to.eql({finished: {}});
          expect(raffle.winnerIds).to.eql([0, 2]);
        });

        it("Error - non-winner claims rewards", async () => {
          // Rejected with error code: NotARaffleWinner
          return expect(ticketBuyer2Client.claimRaffleReward(raffleId)).to
            .eventually.be.rejectedWith("Error Code: NotARaffleWinner");
        });

        it("Error - non-creator claims revenue", async () => {
          // Rejected with error code: NotARaffleWinner
          return expect(ticketBuyer1Client.claimRaffleRevenue(raffleId)).to
            .eventually.be.rejectedWith("Error Code: NotRaffleCreator");
        });

        it("ticketBuyer1 claims raffle rewards", async () => {
          let raffle = await raffleCreatorClient.fetchRaffle(raffleId);
          const raffleNftEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
            raffleAddress);
          let raffleNftEscrowAccount = await devEnv.getSplTokenAccount(
            raffleNftEscrowAddress);
          // Initially raffle nft escrow has 2 nfts.
          expect(Number(raffleNftEscrowAccount.amount)).to.eq(2);
          expect(raffle.claimMask.toNumber()).to.eq(0);

          // ticketBuyer1 claims the rewards.
          await ticketBuyer1Client.claimRaffleReward(raffleId);

          // Checks ticketBuyer1's nft account.
          const ticketBuyer1NftAccount = await devEnv.getSplTokenAccount(
            devEnv.getNftAta("ticketBuyer1", "Gift Card #1")
          );
          expect(Number(ticketBuyer1NftAccount.amount)).to.eq(1);
          // Checks the raffle nft escrow has 1 less nft.
          raffleNftEscrowAccount = await devEnv.getSplTokenAccount(
            raffleNftEscrowAddress);
          expect(Number(raffleNftEscrowAccount.amount)).to.eq(1);
          // The claim mask become 0x01 after ticketBuyer1 claimed.
          raffle = await raffleCreatorClient.fetchRaffle(raffleId);
          expect(raffle.claimMask.toNumber()).to.eq(1);
        });

        it(
          "Error - claim raffle rewards multiple times before nft escrow closed",
          async () => {
            // Rejected with error code: RaffleRewardClaimed.
            return expect(ticketBuyer1Client.claimRaffleReward(raffleId)).to
              .eventually
              .be.rejectedWith("Error Code: RaffleRewardClaimed");
          }
        );

        it("ticketBuyer3 claims raffle rewards", async () => {
          const raffleNftEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
            raffleAddress);
          const previousCreatorBalance = await devEnv.balanceOf("raffleCreator");

          // ticketBuyer3 claims the rewards.
          await ticketBuyer3Client.claimRaffleReward(raffleId);
          // Checks ticketBuyer3's nft account.
          const ticketBuyer3NftAccount = await devEnv.getSplTokenAccount(
            devEnv.getNftAta("ticketBuyer3", "Gift Card #1")
          );
          expect(Number(ticketBuyer3NftAccount.amount)).to.eq(1);
          // The raffle nft escrow is closed as it has amount 0.
          expect(await devEnv.connection.getAccountInfo(raffleNftEscrowAddress)).to.be.null;
          // The rental gets refunded to the raffle creator.
          const currentCreatorBalance = await devEnv.balanceOf("raffleCreator");
          expect(currentCreatorBalance).to.gt(previousCreatorBalance);
          // The claim mask become 0x11 after both winners claimed.
          const raffle = await raffleCreatorClient.fetchRaffle(raffleId);
          expect(raffle.claimMask.toNumber()).to.eq(3);
        });

        it(
          "Error - claim raffle rewards multiple times after nft escrow closed",
          async () => {
            return expect(ticketBuyer3Client.claimRaffleReward(raffleId)).to
              .eventually.be.rejectedWith(
                "caused by account: rewards_escrow_nft_account. Error Code: AccountNotInitialized");
          }
        );

        it("Claim raffle revenue", async () => {
          const globalStates = await raffleCreatorClient.fetchGlobalStates();
          const raffleRevenueEscrowAddress =
            raffleCreatorClient.findPdaRaffleRevenueEscrow(
              raffleAddress);
          const previousFee = await devEnv.ataTokenAmount(
            feeTreasuryAddress,
            "USDT"
          );
          const previousSharedRevenue = await devEnv.ataTokenAmount(
            revenueShareWalletAddress,
            "USDT"
          );
          const previousCreatorTokenBalance = await devEnv.ataTokenAmount(
            "raffleCreator",
            "USDT"
          );
          const totalRevenue = Number((await devEnv.getSplTokenAccount(
            raffleRevenueEscrowAddress)).amount);
          const expectedFee = Math.trunc(totalRevenue *
            globalStates.marketFeeRateBps / 10000);
          const expectedSharedRevenue = Math.trunc((totalRevenue -
            expectedFee) / 10);
          const expectedCreatorRevenue = Math.trunc((totalRevenue -
            expectedFee) * 9 / 10);

          await raffleCreatorClient.claimRaffleRevenue(raffleId);

          const currentFee = await devEnv.ataTokenAmount(
            feeTreasuryAddress,
            "USDT"
          );
          const currentSharedRevenue = await devEnv.ataTokenAmount(
            revenueShareWalletAddress,
            "USDT"
          );
          const currentCreatorTokenBalance = await devEnv.ataTokenAmount(
            "raffleCreator",
            "USDT"
          );
          // Expects that the revenue is distributed correctly.
          expect(currentFee - previousFee).to.eq(expectedFee);
          expect(currentSharedRevenue - previousSharedRevenue).to
            .eq(expectedSharedRevenue);
          expect(currentCreatorTokenBalance - previousCreatorTokenBalance).to
            .eq(expectedCreatorRevenue);
          // Expects the revenue escrow account to be closed.
          expect(await devEnv.connection.getAccountInfo(
            raffleRevenueEscrowAddress)).to.be.null;
        });

        it("Error - claim raffle revenue for multiple times", async () => {
          return expect(raffleCreatorClient.claimRaffleRevenue(raffleId)).to
            .eventually.be.rejectedWith(
              "caused by account: revenue_escrow_token_account. Error Code: AccountNotInitialized");
        });
      });
    });
    describe("Exclusive raffle use cases", () => {
      let raffleId: BN;
      let raffleAddress: PublicKey;
      before(async () => {
        const nftMintAddress = devEnv.getNft("justs #2").address;
        await raffleCreatorClient.createRaffle(
          nftMintAddress,
          devEnv.getTokenMintAddress("USDC"),
          24 * 3600,
          1000,
          toLamport(5),
          1,
          [
            {
              groupType: {nftHolderGroup: {}},
              key: devEnv.getNftCollection("justs").address,
            },
            {
              groupType: {tokenHolderGroup: {}},
              key: devEnv.getTokenMintAddress("USDT"),
            },
          ],
          [
            {
              revenueReceiver: revenueShareWalletAddress,
              shareBps: 1000,
            },
            {
              revenueReceiver: raffleCreatorClient.providerAddress,
              shareBps: 9000,
            },
          ],
        );
        raffleId = await raffleCreatorClient.latestRaffleId();
        raffleAddress = raffleCreatorClient.findPdaRaffle(raffleId);
      });
      it(
        "Error - invalid raffle without eligibility check account payloads",
        async () => {
          // Rejected with error code: NotEnoughPayloadAccounts
          expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
          )).to.eventually.be
            .rejectedWith("Error Code: NotEnoughPayloadAccounts");

          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {tokenHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
          )).to.eventually.be
            .rejectedWith("Error Code: NotEnoughPayloadAccounts");
        }
      );

      it(
        "Error - invalid raffle with inconsistent token & metadata account payloads",
        async () => {
          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("ticketBuyer1", "justs #4"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("Gods #1").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );
      it(
        "Error - invalid raffle with nft token metadata without collection info",
        async () => {

          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("ticketBuyer1", "Standalone #2"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("Standalone #2").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );
      it(
        "Error - invalid raffle with unowned token account payloads",
        async () => {
          return expect(ticketBuyer4Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {tokenHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getTokenAta("ticketBuyer1", "USDT"),
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );
      it(
        "Error - invalid raffle with unowned nft account payloads",
        async () => {

          return expect(ticketBuyer4Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {nftHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("ticketBuyer1", "justs #4"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("justs #4").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be
            .rejectedWith("Error Code: InvalidEligibilityCheckingAccount");
        }
      );
      it(
        "Error - ineligible raffle with empty eligibility check input",
        async () => {
          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            null,
          )).to.eventually.be.rejectedWith("Error Code: Ineligible");
        }
      );
      it(
        "Error - ineligible raffle with ineligible token account",
        async () => {

          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {tokenHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getTokenAta("ticketBuyer1", "USDC"),
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be.rejectedWith("Error Code: Ineligible");
        }
      );
      it(
        "Error - ineligible raffle with ineligible nft account",
        async () => {
          return expect(ticketBuyer1Client.buyRaffleTickets(
            raffleId,
            10,
            {
              groupType: {tokenHolderGroup: {}},
              message: null,
              ed25519Signature: null,
            },
            undefined,
            [
              {
                pubkey: devEnv.getNftAta("ticketBuyer1", "Gods #4"),
                isWritable: false,
                isSigner: false,
              },
              {
                pubkey: devEnv.getNft("Gods #4").metadataAddress,
                isWritable: false,
                isSigner: false,
              },
            ],
          )).to.eventually.be.rejectedWith("Error Code: Ineligible");
        }
      );
      it("ticketBuyer1 buys tickets with eligible NFT account", async () => {
        await ticketBuyer1Client.buyRaffleTickets(
          raffleId,
          10,
          {
            groupType: {nftHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          undefined,
          [
            {
              pubkey: devEnv.getNftAta("ticketBuyer1", "justs #4"),
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: devEnv.getNft("justs #4").metadataAddress,
              isWritable: false,
              isSigner: false,
            },
          ],
        );

        const ticketPosition = await ticketBuyer1Client.fetchRaffleTicketPosition(
          raffleAddress,
          ticketBuyer1Client.providerAddress
        );
        expect(ticketPosition).to.containSubset({
          buyer: ticketBuyer1Client.providerAddress,
          totalNumTickets: 10,
        });
      });
      it("ticketBuyer2 buys tickets with eligible token account", async () => {
        await ticketBuyer2Client.buyRaffleTickets(
          raffleId,
          20,
          {
            groupType: {tokenHolderGroup: {}},
            message: null,
            ed25519Signature: null,
          },
          undefined,
          [
            {
              pubkey: devEnv.getTokenAta("ticketBuyer2", "USDT"),
              isWritable: false,
              isSigner: false,
            },
          ],
        );

        const ticketPosition = await ticketBuyer2Client.fetchRaffleTicketPosition(
          raffleAddress,
          ticketBuyer2Client.providerAddress
        );
        expect(ticketPosition).to.containSubset({
          buyer: ticketBuyer2Client.providerAddress,
          totalNumTickets: 20,
        });
      });
    });

    describe("Cancel raffle", () => {
      let raffleId: BN;
      let raffleAddress: PublicKey;
      before(async () => {
        await createTestRaffle(
          "Gift Card #2",
          undefined,
          undefined,
          undefined,
          3,
        );
        raffleId = await raffleCreatorClient.latestRaffleId();
        raffleAddress = await raffleCreatorClient.findPdaRaffle(raffleId);
      });
      it("Error - non-creator tries to cancel the raffle", async () => {
        return expect(ticketBuyer1Client.cancelRaffle(raffleId))
          .to.eventually.be.rejectedWith("Error Code: NotRaffleCreator");
      });
      it("Cancels when no tickets are sold", async () => {
        let creatorNftToken = await devEnv.getSplTokenAccount(devEnv.getNftAta(
          "raffleCreator",
          "Gift Card #2"
        ));
        expect(Number(creatorNftToken.amount)).to.eq(27);

        await raffleCreatorClient.cancelRaffle(raffleId);
        // Expects that raffle status is "cancelled".
        const raffle = await raffleCreatorClient.fetchLatestRaffle();
        expect(raffle.status).to.eql({cancelled: {}});
        // Expects that the raffled NFTs has been refunded.
        creatorNftToken = await devEnv.getSplTokenAccount(devEnv.getNftAta(
          "raffleCreator",
          "Gift Card #2"
        ));
        expect(Number(creatorNftToken.amount)).to.eq(30);
        // Expects that both rewards & revenue escrow token accounts have been
        // closed.
        const rewardsEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
          raffleAddress);
        const revenueEscrowAddress = raffleCreatorClient.findPdaRaffleRevenueEscrow(
          raffleAddress);
        expect(await devEnv.connection.getAccountInfo(
          rewardsEscrowAddress)).to.be.null;
        expect(await devEnv.connection.getAccountInfo(
          revenueEscrowAddress)).to.be.null;
      });
      it("Error - buys ticket from a cancelled raffle", async () => {
        return expect(ticketBuyer1Client.buyRaffleTickets(raffleId, 1, null)).to
          .eventually.be.rejectedWith(
            "revenue_escrow_token_account. Error Code: AccountNotInitialized");
      });
      it("Error - not cancellable with any ticket sales", async () => {
        await createTestRaffle(
          "Gift Card #2",
          undefined,
          undefined,
          undefined,
          3,
        );
        raffleId = await raffleCreatorClient.latestRaffleId();
        await ticketBuyer1Client.buyRaffleTickets(raffleId, 1, null);
        return expect(raffleCreatorClient.cancelRaffle(raffleId)).to.eventually
          .be.rejectedWith("Error Code: RaffleNotCancelable");
      });
    });
    describe("Claim remaining rewards", () => {
      // A helper function for creating a new raffle, buy some tickets and pick
      // the winners.
      async function createAndMakeRaffle(
        nftName: string,
        numRaffledNfts: number,
        buyers: string[],
        winners: number[],
        rewardClaimers: string[],
      ) {
        // Creates a new raffle.
        await createTestRaffle(
          nftName,
          undefined,
          undefined,
          undefined,
          numRaffledNfts
        );
        const raffle = await raffleCreatorClient.fetchLatestRaffle();
        // Each buyer buys 1 ticket.
        for (let buyer of buyers) {
          await devEnv.justiesClient(buyer)
            .buyRaffleTickets(raffle.id, 1, null);
        }
        const authority = devEnv.justiesClient("authority");
        // Sets mock timestamp to make raffle end.
        await authority.setMockTimestamp(raffle.expiredTimestamp.addn(10));
        // Sets winners.
        await authority.setRaffleWinners(raffle.id, winners);
        // Claims rewards.
        for (let claimer of rewardClaimers) {
          await devEnv.justiesClient(claimer).claimRaffleReward(raffle.id);
        }
      }

      it("Error - no remaining rewards", async () => {
        await createAndMakeRaffle(
          "Gift Card #2",
          2,
          ["ticketBuyer1", "ticketBuyer2"],
          [0, 1],
          [],
        );
        const raffleId = await raffleCreatorClient.latestRaffleId();
        return expect(raffleCreatorClient.claimRemainingRaffleRewards(raffleId))
          .to.eventually.be
          .rejectedWith("Error Code: NoRemainingRaffleRewards");
      });
      it("Error - non-creator claim remaining rewards", async () => {
        await createAndMakeRaffle(
          "Gift Card #2",
          3,
          ["ticketBuyer1", "ticketBuyer2"],
          [0, 1],
          [],
        );
        const raffleId = await raffleCreatorClient.latestRaffleId();
        return expect(ticketBuyer1Client.claimRemainingRaffleRewards(raffleId))
          .to.eventually.be.rejectedWith("Error Code: NotRaffleCreator");
      });
      it("Claim remaining rewards with account closure", async () => {
        await createAndMakeRaffle(
          "Gift Card #2",
          4,
          ["ticketBuyer1", "ticketBuyer2"],
          [0, 1],
          ["ticketBuyer1", "ticketBuyer2"],
        );
        const raffleId = await raffleCreatorClient.latestRaffleId();
        const creatorNftAccount = await devEnv.getNftAta(
          "raffleCreator",
          "Gift Card #2"
        );
        const previousNftAccount = await devEnv.getSplTokenAccount(
          creatorNftAccount);

        await raffleCreatorClient.claimRemainingRaffleRewards(raffleId);

        //  Expects the remaining rewards has been returned.
        const currentNftAccount = await devEnv.getSplTokenAccount(
          creatorNftAccount);
        expect(Number(currentNftAccount.amount)).to
          .eq(Number(previousNftAccount.amount) + 2);
        // Expects the rewards escrow account to be closed.
        const rewardsEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
          raffleCreatorClient.findPdaRaffle(raffleId));
        expect(await devEnv.connection.getAccountInfo(rewardsEscrowAddress)).to.be.null;
      });
      it("Claim remaining rewards without account closure", async () => {
        await createAndMakeRaffle(
          "Gift Card #2",
          3,
          ["ticketBuyer1", "ticketBuyer2"],
          [0, 1],
          ["ticketBuyer1"],
        );

        const raffleId = await raffleCreatorClient.latestRaffleId();
        const creatorNftAccount = await devEnv.getNftAta(
          "raffleCreator",
          "Gift Card #2"
        );
        const previousNftAccount = await devEnv.getSplTokenAccount(
          creatorNftAccount);

        await raffleCreatorClient.claimRemainingRaffleRewards(raffleId);

        //  Expects the remaining rewards has been returned.
        const currentNftAccount = await devEnv.getSplTokenAccount(
          creatorNftAccount);
        expect(Number(currentNftAccount.amount)).to
          .eq(Number(previousNftAccount.amount) + 1);
        // The rewards escrow account is not closed in this case as ticketBuyer2
        // hasn't claimed the reward yet.
        const rewardsEscrowAddress = raffleCreatorClient.findPdaRaffleRewardsEscrow(
          raffleCreatorClient.findPdaRaffle(raffleId));
        const rewardsEscrowAccount = await devEnv.getSplTokenAccount(
          rewardsEscrowAddress);
        expect(Number(rewardsEscrowAccount.amount)).to.eq(1);
      });
    });
    describe("Make raffle", () => {
      let raffleId: BN;
      let raffleAddress: PublicKey;
      let authorityJustiesClient: JustiesProgramClient;

      before(async () => {
        authorityJustiesClient = devEnv.justiesClient("authority");
        const globalStates = await authorityJustiesClient.fetchGlobalStates();
        const ticketSupply = globalStates.maxRaffleTicketSupply;
        // const ticketSupply = 1000;
        // Creates a raffle with max supply for pressure test.
        await createTestRaffle(
          "Gift Card #2",
          undefined,
          undefined,
          ticketSupply,
          2,
          undefined,
          undefined,
          toLamport(0.05),
        );
        raffleId = await raffleCreatorClient.latestRaffleId();
        raffleAddress = await raffleCreatorClient.findPdaRaffle(raffleId);

        const ticketToBuy = Math.trunc(ticketSupply / 3);
        await devEnv.justiesClient("ticketBuyer1")
          .buyRaffleTickets(raffleId, ticketToBuy, null);
        await devEnv.justiesClient("ticketBuyer2")
          .buyRaffleTickets(raffleId, ticketToBuy, null);
        await devEnv.justiesClient("ticketBuyer3")
          .buyRaffleTickets(
            raffleId,
            ticketSupply - 2 * ticketToBuy,
            null
          );

        const raffle = await authorityJustiesClient.fetchLatestRaffle();
        await authorityJustiesClient.setMockTimestamp(
          raffle.expiredTimestamp.addn(10));

        const ticketPositionStats = await authorityJustiesClient.fetchRaffleTicketPositionStats(
          raffleAddress);
      });

      after(async () => {
        await authorityJustiesClient.clearMockTimestamp();
      });

      it("Check status after making raffle", async () => {
        await authorityJustiesClient.makeRaffle(raffleId, false);
        const raffle = await authorityJustiesClient.fetchLatestRaffle();
        // Expects 2 winners are generated.
        expect(raffle.winnerIds.length).to.eq(2);
        // Expects that there are 2 unique winners.
        expect(new Set(raffle.winnerIds).size).to.eq(2);
        expect(raffle.status).to.eql({finished: {}});
      });

      it(
        "Error - make raffle with rerun == false after generated.",
        async () => {
          return expect(authorityJustiesClient.makeRaffle(
            raffleId, false)).to.eventually.be.rejectedWith(
            "Error Code: RaffleAlreadyMade"
          );
        }
      );

      it("Randomization coverage.", async () => {
        const globalStates = await authorityJustiesClient.fetchGlobalStates();
        let mockTimestamp = globalStates.mockTimestamp;
        const numRaffles = 20;
        let uniqueWinners = new Set();
        // Run enough times so that all the winners are highly likely to be
        // covered.
        for (let i = 0; i < numRaffles; ++i) {
          // Make sure the raffles are made with different random seeds each
          // time.
          await authorityJustiesClient.setMockTimestamp(
            mockTimestamp.addn(i + 1));
          await authorityJustiesClient.makeRaffle(raffleId, true);
          const raffle = await authorityJustiesClient.fetchLatestRaffle();
          uniqueWinners.add(JSON.stringify(raffle.winnerIds));
          console.log(`Raffle #${i} winners: ${raffle.winnerIds}`);
        }
        // Expects all combinations occurred.
        expect(uniqueWinners).to.include("[0,1]");
        expect(uniqueWinners).to.include("[0,2]");
        expect(uniqueWinners).to.include("[1,2]");
      });
    });

  });
});
