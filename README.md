# Solana Raffle & Auction Smart Contract

# Overview

This repository provides an on-chain raffle and auction smart contract built on the Solana blockchain using the Anchor framework. It enables decentralized raffles and auctions with provably fair results, supporting NFTs, SPL tokens, and custom assets.

## Features

- Decentralized Raffle System: Verifiably fair randomness using Solana's oracles.

- On-Chain Auctions: Time-based or bid-based auction logic.

- Anchor Framework: Secure and modular smart contract implementation.

- SPL & NFT Support: Accept bids or raffle entries with SPL tokens or NFTs.

- Customizable Parameters: Set entry fees, auction durations, min/max bids, and more.

- Automated Payouts: Smart contract handles winner selection and fund distribution.


## Tech Stack

- Solana Program Library (SPL)

- Rust (Smart Contracts)

- Anchor Framework

- TypeScript (Client & UI)

- Metaplex SDK (NFT Support)

## Smart Contract Architecture

### Raffle Contract

- Users enter the raffle by purchasing tickets (SPL tokens / NFTs).

- Winner is selected using Solana's VRF (Verifiable Random Function) or Oracle.

- Funds are distributed automatically to the winner and the organizer.

### Auction Contract

- Supports English Auctions (highest bidder wins) and Dutch Auctions (price decreases over time).

- Bidders deposit SPL tokens or NFTs.

- The highest bidder at the end wins the asset.

- Funds are automatically transferred to the seller after auction completion.

# Contract

- Twitter  [DeFiMaxi](https://x.com/defai_maxi)
- Telegram [Rhett](https://t.me/rhettjel)