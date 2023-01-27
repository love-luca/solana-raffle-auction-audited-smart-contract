import * as anchor from "@project-serum/anchor";
import {AnchorProvider, Wallet} from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import {Connection, Keypair, PublicKey} from "@solana/web3.js";
import seedrandom from "seedrandom";
import {
  keypairIdentity,
  Metaplex,
  mockStorage,
  NftWithToken,
  SftWithToken,
  toBigNumber
} from "@metaplex-foundation/js";
import {JustiesProgramClient} from "./JustiesProgramClient";
import {fromLamport, toLamport} from "./ProgramUtils";

export interface TokenMetadata {
  name: String;
  mintAddress: PublicKey;
}

export class DevEnvironment {
  rng: seedrandom.PRNG;
  // The major here is for setting up non-anchor environments.
  // The anchor signer is only responsible for interacting with the program being tested.
  majorSigner: Keypair;
  connection: Connection;
  tokens: { [name: string]: TokenMetadata };
  nftCollections: { [name: string]: NftWithToken };
  nfts: { [name: string]: NftWithToken | SftWithToken };
  metaplex: Metaplex;
  justiesClients: { [name: string]: JustiesProgramClient };
  payers: { [name: string]: PublicKey };

  constructor(seed: string) {
    // This can make sure we are generating the deterministic wallets that are handy to be checked.
    const anchorProvider = anchor.AnchorProvider.env();
    this.rng = seedrandom(seed);
    this.connection = anchorProvider.connection;
    this.majorSigner = this.generateKeypair();
    console.log(`major signer: ${this.majorSigner.publicKey.toBase58()}`);
    this.tokens = {};
    this.nftCollections = {};
    this.nfts = {};
    this.metaplex = Metaplex.make(this.connection)
      .use(keypairIdentity(this.majorSigner)).use(mockStorage());
    this.justiesClients = {
      "authority": new JustiesProgramClient(anchorProvider),
    };

    this.payers = {
      "majorSigner": this.majorSigner.publicKey,
      "authority": this.getJustiesPayerAddress("authority"),
    };
  }

  public generateKeypair() {
    return Keypair.fromSeed(this.randomSeed());
  }

  public getTokenMintAddress(name: string): PublicKey {
    return this.tokens[name].mintAddress;
  }

  public getNftCollection(name: string): NftWithToken {
    return this.nftCollections[name];
  }

  public getNft(name: string): NftWithToken | SftWithToken {
    return this.nfts[name];
  }

  public getTokenAta(payerName: string, tokenName: string) {
    const payer = this.payers[payerName];
    const tokenMint = this.getTokenMintAddress(tokenName);
    return splToken.getAssociatedTokenAddressSync(tokenMint, payer);
  }

  public getNftAta(payerName: string, nftName: string) {
    const payer = this.payers[payerName];
    const nftMint = this.getNft(nftName).mint.address;
    return splToken.getAssociatedTokenAddressSync(nftMint, payer);
  }

  public async getSplTokenAccount(address: PublicKey) {
    return splToken.getAccount(this.connection, address);
  }

  public getJustiesPayerAddress(name: string): PublicKey {
    return this.justiesClients[name].justiesProgram.provider.publicKey;
  }

  public async setup() {
    await this.setupAccounts();
    await this.setupTokens();
    await this.setupNfts();
  }

  public justiesClient(payerName: string): JustiesProgramClient {
    return this.justiesClients[payerName];
  }

  public async balanceOf(payerName: string) {
    const payerAddress = this.payers[payerName];
    return await this.connection.getBalance(payerAddress);
  }

  public async ataTokenAmount(owner: string | PublicKey, tokenName: string) {
    const tokenMintAddress = this.tokens[tokenName].mintAddress;
    let ownerAddress = typeof owner === "string" ? this.payers[owner] : owner;
    const tokenAtaAddress = splToken.getAssociatedTokenAddressSync(
      tokenMintAddress,
      ownerAddress
    );
    const accountInfo = await this.connection.getAccountInfo(tokenAtaAddress);
    if (accountInfo === null) {
      return 0;
    }
    const tokenAccount = await splToken.getAccount(
      this.connection,
      tokenAtaAddress
    );
    return Number(tokenAccount.amount);
  }

  public async airdrop(recipientName: string, amount: number) {
    console.log(`Airdropping ${amount} SOL to: "${recipientName}"...`);
    const recipient = this.payers[recipientName];
    const signature = await this.connection.requestAirdrop(
      recipient, toLamport(amount));
    const latestBlockHash = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: signature,
    });
  }

  public async mintTokens(
    recipientName: string,
    tokenName: string,
    amount: number
  ) {
    console.log(`Minting ${amount} ${tokenName} to "${recipientName}"...`);
    const recipient = this.payers[recipientName];
    const tokenMint = this.getTokenMintAddress(tokenName);
    const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.majorSigner,
      tokenMint,
      recipient
    );
    await splToken.mintToChecked(
      this.connection,
      this.majorSigner,
      tokenMint,
      tokenAccount.address,
      this.majorSigner,
      toLamport(amount),
      9,
    );
  }

  public async transferNft(recipientName: string, nftName: string) {
    console.log(`Transferring "${nftName}" from "majorSigner" to "${recipientName}"...`);
    const recipient = this.payers[recipientName];
    const nft = this.getNft(nftName);
    const nftMint = nft.mint;
    const sourceTokenAccount = this.getNft(nftName).token;
    const targetTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.majorSigner,
      nftMint.address,
      recipient,
    );
    await splToken.transferChecked(
      this.connection,
      this.majorSigner,
      sourceTokenAccount.address,
      nftMint.address,
      targetTokenAccount.address,
      this.majorSigner,
      1,
      0
    );
  }

  async setupAccounts() {
    console.log("Setup accounts...");
    // Credit the major signer with some initial 100 SOLs.
    await this.airdrop("majorSigner", 100);
    const balance = await this.connection.getBalance(
      this.majorSigner.publicKey);
    console.log(`major signer balance: ${fromLamport(balance)} SOL`);
  }

  async setupTokens() {
    console.log("Setup tokens...");
    await this.createToken("wSOL");
    await this.createToken("USDC");
    await this.createToken("USDT");
    await this.createToken("FOO");
  }

  async setupNfts() {
    await this.createNftCollection("Gods");
    await this.createNft("Gods #1", "Gods");
    await this.createNft("Gods #2", "Gods");
    await this.createNft("Gods #3", "Gods");
    await this.createNft("Gods #4", "Gods");

    await this.createNftCollection("justs");
    await this.createNft("justs #1", "justs");
    await this.createNft("justs #2", "justs");
    await this.createNft("justs #3", "justs");
    await this.createNft("justs #4", "justs");

    await this.createNftCollection("Bar");
    await this.createNft("Bar #1", "Bar");
    await this.createNft("Bar #2", "Bar");

    await this.createNftCollection("Gift Card");

    // Creates standalone NFTs that doesn't belong to any collections.
    await this.createNft("Standalone #1");
    await this.createNft("Standalone #2");
  }

  public createJustiesClient(payerName: string) {
    const newAnchorProvider = new AnchorProvider(
      this.connection,
      new Wallet(this.generateKeypair()),
      {}
    );
    this.justiesClients[payerName] =
      new JustiesProgramClient(newAnchorProvider);
    this.payers[payerName] = this.getJustiesPayerAddress(payerName);
    return this.justiesClient(payerName)
  }

  async createToken(name: string) {
    const randomKeypair = this.generateKeypair();
    let mintAddress = await splToken.createMint(
      this.connection, this.majorSigner, this.majorSigner.publicKey, null, 9,
      randomKeypair
    );
    console.log(
      `token name: ${name}, random keypair: ${randomKeypair.publicKey.toBase58()}, mint address: ${mintAddress.toBase58()}`);
    this.tokens[name] = {name, mintAddress};
  }

  public async createNftCollection(name: string) {
    console.log(`Creating NFT collection: ${name}...`);
    const {nft} = await this.metaplex.nfts().create({
      uri: "https://dummy-collection-metadata",
      name: name,
      useNewMint: this.generateKeypair(),
      sellerFeeBasisPoints: 200,
      isCollection: true,
      mintAuthority: this.majorSigner,
      updateAuthority: this.majorSigner,
      collectionAuthority: this.majorSigner,
      collectionIsSized: true,
    });
    this.nftCollections[name] = nft;
  }

  public async createSft(
    name: string,
    amount: number,
    collectionName?: string,
    ownerName?: string
  ) {
    const tokenOwner = ownerName !== undefined ? this.payers[ownerName] :
      this.majorSigner.publicKey;
    const collectionAddress = collectionName !== undefined ?
      this.nftCollections[collectionName].address : null;
    if (collectionName !== undefined) {
      console.log(`Creating ${amount} SFT "${name}" in collection "${collectionName}, owner: ${tokenOwner.toBase58()}"`);
    } else {
      console.log(`Creating ${amount} SFT "${name}", owner: ${tokenOwner.toBase58()}"`);
    }
    this.nfts[name] = (await this.metaplex.nfts().createSft({
      uri: "https://dummy-nft-metadata",
      name: name,
      useNewMint: this.generateKeypair(),
      sellerFeeBasisPoints: 200,
      tokenOwner,
      tokenAmount: {
        basisPoints: toBigNumber(amount),
        currency: {
          symbol: name,
          decimals: 0,
          namespace: "spl-token",
        }
      },
      decimals: 0,
      collection: collectionAddress,
      mintAuthority: this.majorSigner,
      updateAuthority: this.majorSigner,
      collectionAuthority: this.majorSigner,
      collectionIsSized: true,
    })).sft as SftWithToken;
  }

  async createNft(name: string, collectionName?: string) {
    if (collectionName !== undefined) {
      console.log(`Creating NFT "${name}" in collection "${collectionName}"`);
    } else {
      console.log(`Creating NFT "${name}"`);
    }
    const collectionAddress = collectionName !== undefined ?
      this.nftCollections[collectionName].address : null;
    const {nft} = await this.metaplex.nfts().create({
      uri: "https://dummy-nft-metadata",
      name: name,
      useNewMint: this.generateKeypair(),
      sellerFeeBasisPoints: 200,
      collection: collectionAddress,
      mintAuthority: this.majorSigner,
      updateAuthority: this.majorSigner,
      collectionAuthority: this.majorSigner,
      collectionIsSized: true,
    });
    this.nfts[name] = nft;
    // Uncomment for debugging.
    // console.log(`NFT: "${name}"`);
    // console.log(`Collection Address: "${nft.collection.address}"`);
    // console.log(`Mint Address: "${nft.mint.address}"`);
    // console.log(`Metadata Address: "${nft.metadataAddress}"`);
    // console.log(`Associated Token Address: "${nft.token.address}"`);
    // let tokenAccount = await getAccount(this.connection, nft.token.address);
    // console.log(`Associated Token Account: "${JSON.stringify(
    //   tokenAccount,
    //   (key, value) =>
    //     typeof value === "bigint"
    //       ? value.toString()
    //       : value // return everything else unchanged
    //   , 2
    // )}"`);
  }

  private randomSeed(): Uint8Array {
    const randomSeed = new Uint8Array(32);
    const bitMask = (1 << 8 - 1);
    for (let i = 0; i < 8; i++) {
      let randomInt = this.rng.int32();
      for (let j = 0; j < 4; j++) {
        randomSeed[i * 4 + j] = randomInt & bitMask;
        randomInt = randomInt >> 8;
      }
    }
    return randomSeed;
  }
}
