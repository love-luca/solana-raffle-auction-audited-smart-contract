import {PublicKey} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import {
  PROGRAM_ADDRESS as METAPLEX_TOKEN_METADATA_PROGRAM
} from "@metaplex-foundation/mpl-token-metadata";

export function findPda(programId: PublicKey, ...args: any[]): PublicKey {
  const seeds: Array<Buffer | Uint8Array> = [];
  for (let arg of args) {
    if (arg instanceof PublicKey ||
      (typeof arg === "object" && arg.constructor.name === "PublicKey")) {
      seeds.push(arg.toBytes());
    } else if (arg instanceof anchor.BN) {
      seeds.push(arg.toBuffer("le", 8));
    } else if (typeof arg === "string") {
      seeds.push(anchor.utils.bytes.utf8.encode(arg));
    } else if (typeof arg === "number") {
      // Only 4-bytes int are supported here.
      const value = new anchor.BN(arg);
      seeds.push(value.toBuffer("le", 4));
    } else {
      console.log("Missing type!!!!!!!!!!!!!!!!!");
      console.log(typeof arg);
      console.log(arg.constructor.name);
      console.log(arg.toString());
    }
  }
  const [pda, _] = PublicKey.findProgramAddressSync(seeds, programId);
  return pda;
}

export function findPdaProgramData(programId: PublicKey) {
  return findPda(BUILTIN_PROGRAMS.BPF_LOADER_UPGRADEABLE, programId);
}

export function findPdaTokenMetadata(tokenMintAddress: PublicKey) {
  return findPda(
    BUILTIN_PROGRAMS.METAPLEX_TOKEN_METADATA, "metadata",
    BUILTIN_PROGRAMS.METAPLEX_TOKEN_METADATA, tokenMintAddress);
}

export function toLamport(amount: number) {
  return amount * 1e9;
}

export function fromLamport(amount: number) {
  return amount / 1e9;
}

export const BUILTIN_PROGRAMS = {
  SYSTEM: anchor.web3.SystemProgram.programId,
  BPF_LOADER_UPGRADEABLE: new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"),
  METAPLEX_TOKEN_METADATA: new PublicKey(METAPLEX_TOKEN_METADATA_PROGRAM),
};
