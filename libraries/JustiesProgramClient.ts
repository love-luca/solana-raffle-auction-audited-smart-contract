import {Justies, IDL} from "../target/types/justies";
import * as anchor from "@project-serum/anchor";
import {AnchorProvider, BN, IdlTypes, Program} from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import {ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {AccountMeta, Connection, PublicKey} from "@solana/web3.js";
import {BUILTIN_PROGRAMS, findPda, findPdaTokenMetadata} from "./ProgramUtils";
import {Metaplex, mockStorage} from "@metaplex-foundation/js";
import {SYSVAR_SLOT_HASHES_PUBKEY} from "@solana/web3.js";

export type GroupConfig = IdlTypes<Justies>["GroupConfig"];
export type RevenueShareConfig = IdlTypes<Justies>["RevenueShareConfig"];
export type EligibilityCheckInput = IdlTypes<Justies>["EligibilityCheckInput"];
export type UpdateConfigsInput = IdlTypes<Justies>["UpdateConfigsInput"];

// A client interacts with the justies program.
export class JustiesProgramClient {
  connection: Connection;
  programId: PublicKey;
  justiesProgram: Program<Justies>;
  metaplex: Metaplex;

  constructor(provider: AnchorProvider) {
    this.connection = provider.connection;
    this.programId = (anchor.workspace.Justies as Program<Justies>).programId;
    this.justiesProgram = new Program<Justies>(
      IDL,
      this.programId,
      provider
    );

    this.metaplex = Metaplex.make(this.connection).use(mockStorage());
  }

  public get providerAddress() {
    return this.justiesProgram.provider.publicKey;
  }

  static getDefaultUpdateConfigsInput(): UpdateConfigsInput {
    return {
      marketFeeRateBps: null,
      feeTreasuryAddress: null,
      minOutbidRateBps: null,
      lastMinutesForAuctionExtend: null,
      auctionExtendMinutes: null,
      minAuctionDuration: null,
      maxAuctionDuration: null,
      minRaffleTicketSupply: null,
      maxRaffleTicketSupply: null,
      maxRaffledNfts: null,
      minRaffleDuration: null,
      maxRaffleDuration: null,
      auctionCreationEnabled: null,
      raffleCreationEnabled: null,
      numKeysPerIndexPage: null,
    };
  }

  static getPubkeyIndexPageId(totalKeys: BN, pageSize: number): number {
    return Math.trunc(totalKeys.toNumber() / pageSize);
  }

  public findPda(...args: any[]) {
    return findPda(this.programId, ...args);
  }

  public async latestAuctionId() {
    return (await this.fetchGlobalStates()).totalAuctions.subn(1);
  }

  public async latestRaffleId() {
    return (await this.fetchGlobalStates()).totalRaffles.subn(1);
  }

  private async confirmTxn(txn: string) {
    const latestBlockHash = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txn,
    });
  }

  private createRemainingAccountsForRevenueDistribution(
    tokenMintAddress: PublicKey,
    revenueShareConfigs,
  ): AccountMeta[] {
    const recipients: AccountMeta[] = [];
    const recipientTokenAccounts: AccountMeta[] = [];

    revenueShareConfigs.forEach((config: RevenueShareConfig) => {
      recipients.push({
        pubkey: config.revenueReceiver,
        isWritable: false,
        isSigner: false,
      });
      recipientTokenAccounts.push({
        pubkey: splToken.getAssociatedTokenAddressSync(
          tokenMintAddress,
          config.revenueReceiver
        ),
        isWritable: true,
        isSigner: false,
      });
    });

    return recipients.concat(recipientTokenAccounts);
  }

  private async* getIndexedKeys(
    totalKeys: BN,
    pageSize: number,
    pdaGetter: (pageId: number) => PublicKey
  ) {
    let page;
    for (let currentIdx = 0; currentIdx < totalKeys.toNumber(); ++currentIdx) {
      const pageId = JustiesProgramClient.getPubkeyIndexPageId(
        new BN(currentIdx),
        pageSize
      );
      const idxWithinPage = currentIdx % pageSize;
      if (idxWithinPage == 0) {
        page =
          await this.justiesProgram.account.pubkeyIndexPage.fetch(pdaGetter(
            pageId));
      }
      yield page.keys[idxWithinPage];
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // PDA getters;
  //////////////////////////////////////////////////////////////////////////////
  public findPdaGlobalStates() {
    return this.findPda("global_states");
  }

  public findPdaTokenAllowlistStates(tokenMintAddress: PublicKey) {
    return this.findPda("token_allowlist_states", tokenMintAddress);
  }

  public findPdaTokenAllowlistIndex(pageId: number) {
    return this.findPda("token_allowlist_index", new BN(pageId));
  }

  public findPdaNftAllowlistStates(collectionMintAddress: PublicKey) {
    return this.findPda("nft_allowlist_states", collectionMintAddress);
  }

  public findPdaNftAllowlistIndex(pageId: number) {
    return this.findPda("nft_allowlist_index", new BN(pageId));
  }

  public findPdaAuction(id: anchor.BN) {
    return this.findPda("auction", id);
  }

  public findPdaLotEscrow(auctionAddress: PublicKey) {
    return this.findPda("auction", auctionAddress, "lot_escrow");
  }

  public findPdaAuctionBid(
    auctionAddress: PublicKey,
    bidderAddress: PublicKey
  ) {
    return this.findPda("auction", auctionAddress, "bid", bidderAddress);
  }

  public findPdaBidsIndexPage(auctionAddress: PublicKey, pageId: number) {
    return this.findPda(
      "auction",
      auctionAddress,
      "bid_index",
      new BN(pageId)
    );
  }

  public findPdaBidEscrow(
    auctionAddress: PublicKey,
    bidderAddress: PublicKey
  ) {
    return this.findPda(
      "auction",
      auctionAddress,
      "bid",
      bidderAddress,
      "escrow"
    );
  }

  public findPdaRaffle(id: anchor.BN) {
    return this.findPda("raffle", id);
  }

  public findPdaRaffleRewardsEscrow(raffleAddress: PublicKey) {
    return this.findPda("raffle", raffleAddress, "rewards_escrow");
  }

  public findPdaRaffleRevenueEscrow(raffleAddress: PublicKey) {
    return this.findPda("raffle", raffleAddress, "revenue_escrow");
  }

  public findPdaRaffleTicketPosition(
    raffleAddress: PublicKey,
    buyerAddress: PublicKey
  ) {
    return this.findPda(
      "raffle",
      raffleAddress,
      "ticket_position",
      buyerAddress
    );
  }

  public findPdaRaffleTicketPositionStats(raffleAddress: PublicKey) {
    return this.findPda("raffle", raffleAddress, "ticket_position_stats");
  }

  public findPdaRaffleTicketPositionIndex(
    raffleAddress: PublicKey,
    pageId: number
  ) {
    return this.findPda(
      "raffle",
      raffleAddress,
      "ticket_position_index",
      new BN(pageId),
    );
  }

  //////////////////////////////////////////////////////////////////////////////
  // Account states fetchers;
  //////////////////////////////////////////////////////////////////////////////
  public async fetchGlobalStates() {
    return await this.justiesProgram.account.globalStates.fetch(
      this.findPdaGlobalStates());
  }

  public async fetchTokenAllowlistStates(tokenMintAddress: PublicKey) {
    return await this.justiesProgram.account.tokenAllowlistStates.fetchNullable(
      this.findPdaTokenAllowlistStates(tokenMintAddress));
  }

  public async fetchTokenAllowlistIndex(pageId: number) {
    return await this.justiesProgram.account.pubkeyIndexPage.fetch(
      this.findPdaTokenAllowlistIndex(pageId));
  }

  public async fetchNftAllowlistStates(collectionMintAddress: PublicKey) {
    return await this.justiesProgram.account.tokenAllowlistStates.fetchNullable(
      this.findPdaNftAllowlistStates(collectionMintAddress));
  }

  public async fetchNftAllowlistIndex(pageId: number) {
    return await this.justiesProgram.account.pubkeyIndexPage.fetch(
      this.findPdaNftAllowlistIndex(pageId));
  }

  public async fetchLatestAuction() {
    const auctionId = await this.latestAuctionId();
    return await this.fetchAuction(auctionId);
  }

  public async fetchAuction(auctionId: anchor.BN) {
    return await this.justiesProgram.account.auction.fetch(
      this.findPdaAuction(auctionId));
  }

  public async fetchAuctionBid(
    auctionAddress: PublicKey,
    bidderAddress: PublicKey
  ) {
    return await this.justiesProgram.account.auctionBid.fetchNullable(
      this.findPdaAuctionBid(auctionAddress, bidderAddress));
  }

  public async fetchBidsIndexPage(auctionAddress: PublicKey, pageId: number) {
    return await this.justiesProgram.account.pubkeyIndexPage.fetch(
      this.findPdaBidsIndexPage(auctionAddress, pageId)
    );
  }

  public async fetchLatestRaffle() {
    const raffleId = await this.latestRaffleId();
    return await this.fetchRaffle(raffleId);
  }

  public async fetchRaffle(raffleId: anchor.BN) {
    return await this.justiesProgram.account.raffle.fetch(this.findPdaRaffle(
      raffleId));
  }

  public async fetchRaffleTicketPosition(
    raffleAddress: PublicKey,
    buyerAddress: PublicKey
  ) {
    return await this.justiesProgram.account.raffleTicketPosition.fetch(
      this.findPdaRaffleTicketPosition(
        raffleAddress,
        buyerAddress
      ));
  }

  public async fetchRaffleTicketPositionStats(raffleAddress: PublicKey) {
    return await this.justiesProgram.account.ticketPositionStats.fetch(
      this.findPdaRaffleTicketPositionStats(raffleAddress)
    );
  }

  //////////////////////////////////////////////////////////////////////////////
  // Generators;
  //////////////////////////////////////////////////////////////////////////////
  public async* getTokenAllowlistStates() {
    const globalStates = await this.fetchGlobalStates();
    for await (const pdaKey of this.getIndexedKeys(
      globalStates.totalAllowedCurrencyTokens,
      globalStates.numKeysPerIndexPage,
      this.findPdaTokenAllowlistIndex.bind(this),
    )) {
      yield await
        this.justiesProgram.account.tokenAllowlistStates.fetch(pdaKey);
    }
  }

  public async* getNftAllowlistStates() {
    const globalStates = await this.fetchGlobalStates();
    for await (const pdaKey of this.getIndexedKeys(
      globalStates.totalAllowedNftCollections,
      globalStates.numKeysPerIndexPage,
      this.findPdaNftAllowlistIndex.bind(this),
    )) {
      yield await
        this.justiesProgram.account.tokenAllowlistStates.fetch(pdaKey);
    }
  }

  public async* getAuctionBids(auctionId: BN) {
    const auction = await this.fetchAuction(auctionId);
    const auctionAddress = this.findPdaAuction(auctionId);
    const globalStates = await this.fetchGlobalStates();
    for await (const pdaKey of this.getIndexedKeys(
      auction.totalBids,
      globalStates.numKeysPerIndexPage,
      (pageId: number) => {
        return this.findPdaBidsIndexPage(auctionAddress, pageId);
      }
    )) {
      yield await
        this.justiesProgram.account.auctionBid.fetch(pdaKey);
    }
  }

  public async* getRaffleTicketPositions(raffleId: BN) {
    const raffle = await this.fetchRaffle(raffleId);
    const raffleAddress = this.findPdaRaffle(raffleId);
    const globalStates = await this.fetchGlobalStates();
    for await (const pdaKey of this.getIndexedKeys(
      new BN(raffle.numTicketPositions),
      globalStates.numKeysPerIndexPage,
      (pageId: number) => {
        return this.findPdaRaffleTicketPositionIndex(raffleAddress, pageId);
      }
    )) {
      yield await
        this.justiesProgram.account.raffleTicketPosition.fetch(pdaKey);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Txns runners;
  //////////////////////////////////////////////////////////////////////////////

  public async initProgram(
    feeRateBps: number,
    feeTreasuryAddress: PublicKey,
    isTestEnvironment: boolean
  ) {
    await this.justiesProgram.methods.initJustiesProgram(
      feeRateBps,
      feeTreasuryAddress,
      isTestEnvironment,
    ).accounts(
      {
        globalStates: this.findPdaGlobalStates(),
        authority: this.providerAddress,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }
    ).rpc();
  }

  public async updateConfigs(
    input: UpdateConfigsInput,
  ) {
    await this.justiesProgram.methods.updateConfigs(input).accounts(
      {
        globalStates: this.findPdaGlobalStates(),
        authority: this.providerAddress,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }
    ).rpc();
  }

  public async setMockTimestamp(timestamp: anchor.BN | null) {
    await this.justiesProgram.methods.setMockTimestamp(timestamp)
      .accounts({
        globalStates: this.findPdaGlobalStates(),
        authority: this.providerAddress,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }).rpc();
  }

  public async clearMockTimestamp() {
    await this.setMockTimestamp(null);
  }


  public async addCurrencyTokenToAllowlist(tokenMintAddress: PublicKey, indexPageId?: number) {
    const globalStates = await this.fetchGlobalStates();
    if (indexPageId === undefined) {
      indexPageId = JustiesProgramClient.getPubkeyIndexPageId(
        globalStates.totalAllowedCurrencyTokens,
        globalStates.numKeysPerIndexPage
      );
    }
    await this.justiesProgram.methods.addCurrencyTokenToAllowlist(
      tokenMintAddress).accounts(
      {
        tokenAllowlistStates: this.findPdaTokenAllowlistStates(
          tokenMintAddress),
        tokenAllowlistIndex: this.findPdaTokenAllowlistIndex(indexPageId),
        feeTreasuryTokenAccount: splToken.getAssociatedTokenAddressSync(
          tokenMintAddress,
          globalStates.feeTreasuryAddress
        ),
        authority: this.providerAddress,
        feeTreasury: globalStates.feeTreasuryAddress,
        globalStates: this.findPdaGlobalStates(),
        currencyTokenMint: tokenMintAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        justiesProgram: this.programId,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }).rpc();
  }

  public async addNftCollectionToAllowlist(collectionMintAddress: PublicKey, indexPageId?: number) {
    const globalStates = await this.fetchGlobalStates();
    if (indexPageId === undefined) {
      indexPageId = JustiesProgramClient.getPubkeyIndexPageId(
        globalStates.totalAllowedNftCollections,
        globalStates.numKeysPerIndexPage
      );
    }
    const metadataPda = findPdaTokenMetadata(collectionMintAddress);
    await this.justiesProgram.methods.addNftCollectionToAllowlist(
      collectionMintAddress)
      .accounts({
        nftAllowlistStates: this.findPdaNftAllowlistStates(
          collectionMintAddress),
        nftAllowlistIndex: this.findPdaNftAllowlistIndex(indexPageId),
        authority: this.providerAddress,
        globalStates: this.findPdaGlobalStates(),
        nftCollectionMint: collectionMintAddress,
        collectionMetadata: metadataPda,
        justiesProgram: this.programId,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }).rpc();
  }

  // This method assumes the nft token account is an ATA.
  public async createAuction(
    nftMint: PublicKey,
    currencyTokenMint: PublicKey,
    duration: number,
    startBid: number,
    eligibleGroups: GroupConfig[],
    revenueShares: RevenueShareConfig[],
    creatorNftAccount?: PublicKey,
  ) {
    const globalStates = await this.fetchGlobalStates();
    const auctionId = globalStates.totalAuctions;
    const auctionAddress = this.findPdaAuction(auctionId);
    const nftMetadata = await this.metaplex.nfts()
      .findByMint({mintAddress: nftMint});

    if (creatorNftAccount === undefined) {
      creatorNftAccount = splToken.getAssociatedTokenAddressSync(
        nftMint,
        this.providerAddress
      );
    }

    await this.justiesProgram.methods.createAuction(
      auctionId,
      new BN(duration),
      new BN(startBid),
      eligibleGroups,
      revenueShares
    ).accounts({
      auction: this.findPdaAuction(globalStates.totalAuctions),
      nftMint: nftMint,
      currencyTokenMint: currencyTokenMint,
      creator: this.providerAddress,
      lotEscrowNftAccount: this.findPdaLotEscrow(auctionAddress),
      creatorNftAccount: creatorNftAccount,
      nftMetadata: findPdaTokenMetadata(nftMint),
      globalStates: this.findPdaGlobalStates(),
      nftAllowlistStates: this.findPdaNftAllowlistStates(nftMetadata.collection.address),
      tokenAllowlistStates: this.findPdaTokenAllowlistStates(currencyTokenMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async cancelAuction(auctionId: anchor.BN) {
    const auction = await this.fetchAuction(auctionId);
    const auctionAddress = await this.findPdaAuction(auctionId);
    await this.justiesProgram.methods.cancelAuction(auctionId).accounts({
      auction: auctionAddress,
      creator: this.providerAddress,
      nftMint: auction.nftMintAddress,
      lotEscrowNftAccount: this.findPdaLotEscrow(auctionAddress),
      creatorNftAccount: splToken.getAssociatedTokenAddressSync(
        auction.nftMintAddress,
        this.providerAddress
      ),
      globalStates: this.findPdaGlobalStates(),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    })
      .rpc();
  }

  public async makeBid(
    auctionId: anchor.BN,
    bidAmount: number,
    maxAllowedBidAmount: number,
    eligibilityCheckInput: EligibilityCheckInput | null,
    currencyTokenMintAddress: PublicKey,
    bidderTokenAccount?: PublicKey,
    accountPayloads?: AccountMeta[],
    indexPageId?: number,
  ) {
    const auction = await this.fetchAuction(auctionId);
    const globalStates = await this.fetchGlobalStates();
    const auctionAddress = this.findPdaAuction(auctionId);
    const bidderAddress = this.providerAddress;
    let remainingAccounts: AccountMeta[] = [];

    if (indexPageId === undefined) {
      indexPageId = Math.trunc(auction.totalBids.toNumber() /
        globalStates.numKeysPerIndexPage);
    }

    if (bidderTokenAccount === undefined) {
      bidderTokenAccount = splToken.getAssociatedTokenAddressSync(
        currencyTokenMintAddress,
        bidderAddress
      );
    }

    if (accountPayloads !== undefined) {
      remainingAccounts = accountPayloads;
    }

    await this.justiesProgram.methods.makeBid(
      auctionId,
      new anchor.BN(bidAmount),
      new anchor.BN(maxAllowedBidAmount),
      eligibilityCheckInput,
    ).accounts({
      bid: this.findPdaAuctionBid(auctionAddress, bidderAddress),
      bidIndex: this.findPdaBidsIndexPage(auctionAddress, indexPageId),
      auction: auctionAddress,
      bidder: bidderAddress,
      bidEscrowTokenAccount: this.findPdaBidEscrow(
        auctionAddress,
        bidderAddress
      ),
      bidderTokenAccount: bidderTokenAccount,
      currencyTokenMint: currencyTokenMintAddress,
      globalStates: this.findPdaGlobalStates(),
      justiesProgram: this.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).remainingAccounts(remainingAccounts).rpc();
  }

  public async claimLotNft(auctionId: anchor.BN) {
    const auctionAddress = this.findPdaAuction(auctionId);
    const auction = await this.fetchAuction(auctionId);
    const bidderAddress = this.providerAddress;
    const bidAddress = this.findPdaAuctionBid(auctionAddress, bidderAddress);
    await this.justiesProgram.methods.claimLotNft(auctionId).accounts({
      bid: bidAddress,
      auction: auctionAddress,
      bidder: bidderAddress,
      lotEscrowNftAccount: this.findPdaLotEscrow(auctionAddress),
      bidderNftAccount: splToken.getAssociatedTokenAddressSync(
        auction.nftMintAddress,
        bidderAddress
      ),
      globalStates: this.findPdaGlobalStates(),
      auctionCreator: auction.creator,
      nftMint: auction.nftMintAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async cancelAuctionBid(auctionId: anchor.BN) {
    const auctionAddress = this.findPdaAuction(auctionId);
    const auction = await this.fetchAuction(auctionId);
    const bidderAddress = this.providerAddress;
    const bidAddress = this.findPdaAuctionBid(auctionAddress, bidderAddress);
    await this.justiesProgram.methods.cancelAuctionBid(auctionId).accounts({
      bid: bidAddress,
      auction: auctionAddress,
      bidder: bidderAddress,
      bidEscrowTokenAccount: this.findPdaBidEscrow(
        auctionAddress,
        bidderAddress
      ),
      bidderTokenAccount: splToken.getAssociatedTokenAddressSync(
        auction.currencyTokenMintAddress,
        bidderAddress
      ),
      tokenMint: auction.currencyTokenMintAddress,
      globalStates: this.findPdaGlobalStates(),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async claimAuctionRevenue(auctionId: anchor.BN) {
    const auctionAddress = this.findPdaAuction(auctionId);
    const auction = await this.fetchAuction(auctionId);
    const globalStates = await this.fetchGlobalStates();
    const topBidderAddress = auction.topBidder;
    const remainingAccounts = this.createRemainingAccountsForRevenueDistribution(
      auction.currencyTokenMintAddress,
      auction.revenueShares,
    );
    await this.justiesProgram.methods.claimAuctionRevenue(auctionId).accounts({
      auction: auctionAddress,
      topBid: this.findPdaAuctionBid(auctionAddress, topBidderAddress),
      creator: auction.creator,
      bidEscrowTokenAccount: this.findPdaBidEscrow(
        auctionAddress,
        topBidderAddress
      ),
      feeTreasuryTokenAccount: splToken.getAssociatedTokenAddressSync(
        auction.currencyTokenMintAddress,
        globalStates.feeTreasuryAddress
      ),
      tokenMint: auction.currencyTokenMintAddress,
      topBidder: topBidderAddress,
      feeTreasury: globalStates.feeTreasuryAddress,
      globalStates: this.findPdaGlobalStates(),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    })
      .remainingAccounts(remainingAccounts).rpc();
  }

  public async createRaffle(
    nftMint: PublicKey,
    currencyTokenMint: PublicKey,
    duration: number,
    ticketSupply: number,
    ticketPrice: number,
    numRaffledNfts: number,
    eligibleGroups: GroupConfig[],
    revenueShares: RevenueShareConfig[],
    creatorNftAccount?: PublicKey,
  ) {
    const globalStates = await this.fetchGlobalStates();
    const raffleId = globalStates.totalRaffles;
    const raffleAddress = this.findPdaRaffle(raffleId);
    const nftMetadata = await this.metaplex.nfts()
      .findByMint({mintAddress: nftMint});

    if (creatorNftAccount === undefined) {
      creatorNftAccount = splToken.getAssociatedTokenAddressSync(
        nftMint,
        this.providerAddress
      );
    }

    await this.justiesProgram.methods.createRaffle(
      raffleId,
      new BN(duration),
      ticketSupply,
      new BN(ticketPrice),
      numRaffledNfts,
      eligibleGroups,
      revenueShares,
    ).accounts({
      raffle: raffleAddress,
      ticketPositionStats: this.findPdaRaffleTicketPositionStats(raffleAddress),
      globalStates: this.findPdaGlobalStates(),
      nftMint: nftMint,
      currencyTokenMint: currencyTokenMint,
      creator: this.providerAddress,
      creatorNftAccount: creatorNftAccount,
      rewardsEscrowNftAccount: this.findPdaRaffleRewardsEscrow(raffleAddress),
      revenueEscrowTokenAccount: this.findPdaRaffleRevenueEscrow(
        raffleAddress),
      nftMetadata: nftMetadata.metadataAddress,
      nftAllowlistStates: this.findPdaNftAllowlistStates(nftMetadata.collection.address),
      tokenAllowlistStates: this.findPdaTokenAllowlistStates(currencyTokenMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async cancelRaffle(raffleId: BN) {
    const raffle = await this.fetchRaffle(raffleId);
    const raffleAddress = await this.findPdaRaffle(raffleId);
    await this.justiesProgram.methods.cancelRaffle(raffleId).accounts({
      raffle: raffleAddress,
      creator: this.providerAddress,
      nftMint: raffle.nftMintAddress,
      currencyTokenMint: raffle.currencyTokenMintAddress,
      rewardsEscrowNftAccount: this.findPdaRaffleRewardsEscrow(raffleAddress),
      revenueEscrowTokenAccount: this.findPdaRaffleRevenueEscrow(raffleAddress),
      creatorNftAccount: splToken.getAssociatedTokenAddressSync(
        raffle.nftMintAddress,
        this.providerAddress
      ),
      globalStates: this.findPdaGlobalStates(),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async buyRaffleTickets(
    raffleId: BN,
    numTickets: number,
    eligibilityCheckInput: EligibilityCheckInput | null,
    buyerTokenAccount?: PublicKey,
    accountPayloads?: AccountMeta[],
    indexPageId?: number,
  ) {
    const raffle = await this.fetchRaffle(raffleId);
    const raffleAddress = this.findPdaRaffle(raffleId);
    let remainingAccounts: AccountMeta[] = [];
    if (buyerTokenAccount === undefined) {
      buyerTokenAccount = splToken.getAssociatedTokenAddressSync(
        raffle.currencyTokenMintAddress,
        this.providerAddress
      );
    }
    if (accountPayloads !== undefined) {
      remainingAccounts = accountPayloads;
    }
    const globalStates = await this.fetchGlobalStates();
    if (indexPageId === undefined) {
      indexPageId = Math.trunc(raffle.numTicketPositions /
        globalStates.numKeysPerIndexPage);
    }
    await this.justiesProgram.methods.buyRaffleTickets(
      raffleId,
      numTickets,
      eligibilityCheckInput,
    ).accounts({
      raffle: raffleAddress,
      globalStates: this.findPdaGlobalStates(),
      buyer: this.providerAddress,
      currencyTokenMint: raffle.currencyTokenMintAddress,
      revenueEscrowTokenAccount: this.findPdaRaffleRevenueEscrow(
        raffleAddress),
      buyerTokenAccount: buyerTokenAccount,
      ticketPosition: this.findPdaRaffleTicketPosition(
        raffleAddress,
        this.providerAddress
      ),
      ticketPositionStats: this.findPdaRaffleTicketPositionStats(raffleAddress),
      ticketPositionIndex: this.findPdaRaffleTicketPositionIndex(
        raffleAddress,
        indexPageId
      ),
      tokenProgram: TOKEN_PROGRAM_ID,
      justiesProgram: this.programId,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).remainingAccounts(remainingAccounts).rpc();
  }

  public async claimRaffleReward(
    raffleId: BN,
    claimerNftAccount?: PublicKey
  ) {
    const raffleAddress = this.findPdaRaffle(raffleId);
    const raffle = await this.fetchRaffle(raffleId);
    if (claimerNftAccount === undefined) {
      claimerNftAccount = splToken.getAssociatedTokenAddressSync(
        raffle.nftMintAddress,
        this.providerAddress
      );
    }
    await this.justiesProgram.methods.claimRaffleReward(
      raffleId
    ).accounts({
      raffle: raffleAddress,
      globalStates: this.findPdaGlobalStates(),
      claimer: this.providerAddress,
      ticketPosition: this.findPdaRaffleTicketPosition(raffleAddress, this.providerAddress),
      rewardsEscrowNftAccount: this.findPdaRaffleRewardsEscrow(raffleAddress),
      claimerNftAccount: claimerNftAccount,
      nftMint: raffle.nftMintAddress,
      creator: raffle.creator,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async claimRaffleRevenue(raffleId: BN) {
    const raffleAddress = this.findPdaRaffle(raffleId);
    const raffle = await this.fetchRaffle(raffleId);
    const globalStates = await this.fetchGlobalStates();
    const remainingAccounts = this.createRemainingAccountsForRevenueDistribution(
      raffle.currencyTokenMintAddress,
      raffle.revenueShares,
    );
    await this.justiesProgram.methods.claimRaffleRevenue(raffleId).accounts({
      raffle: raffleAddress,
      globalStates: this.findPdaGlobalStates(),
      creator: this.providerAddress,
      revenueEscrowTokenAccount: this.findPdaRaffleRevenueEscrow(
        raffleAddress),
      feeTreasuryTokenAccount: splToken.getAssociatedTokenAddressSync(
        raffle.currencyTokenMintAddress,
        globalStates.feeTreasuryAddress
      ),
      feeTreasury: globalStates.feeTreasuryAddress,
      tokenMint: raffle.currencyTokenMintAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).remainingAccounts(remainingAccounts).rpc();
  }

  public async setRaffleWinners(raffleId: BN, winners: number[]) {
    await this.justiesProgram.methods.setRaffleWinners(raffleId, winners)
      .accounts({
        raffle: this.findPdaRaffle(raffleId),
        globalStates: this.findPdaGlobalStates(),
        authority: this.providerAddress,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }).rpc();
  }

  public async makeRaffle(raffleId: BN, rerun: boolean) {
    const raffleAddress = this.findPdaRaffle(raffleId);
    await this.justiesProgram.methods.makeRaffle(raffleId, rerun).accounts({
      raffle: this.findPdaRaffle(raffleId),
      ticketPositionStats: this.findPdaRaffleTicketPositionStats(raffleAddress),
      globalStates: this.findPdaGlobalStates(),
      authority: this.providerAddress,
      systemProgram: BUILTIN_PROGRAMS.SYSTEM,
    }).rpc();
  }

  public async claimRemainingRaffleRewards(raffleId: BN) {
    const raffleAddress = this.findPdaRaffle(raffleId);
    const raffle = await this.fetchRaffle(raffleId);
    await this.justiesProgram.methods.claimRemainingRaffleRewards(raffleId)
      .accounts({
        raffle: raffleAddress,
        creator: this.providerAddress,
        nftMint: raffle.nftMintAddress,
        rewardsEscrowNftAccount: this.findPdaRaffleRewardsEscrow(raffleAddress),
        creatorNftAccount: splToken.getAssociatedTokenAddressSync(
          raffle.nftMintAddress,
          this.providerAddress
        ),
        globalStates: this.findPdaGlobalStates(),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: BUILTIN_PROGRAMS.SYSTEM,
      }).rpc();
  }
}
