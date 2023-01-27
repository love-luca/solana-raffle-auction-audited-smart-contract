# Justies Solana Program
## Use cases

Justies is a webapp that supports creation of auctions and raffles. The code repo contains the implementation of
Justies' on-chain program. The major use cases include:

* **Admin**
  * **Initialize program**
    * Initializes the program by setting up multiple key params;
    * Details: [init_justies_program.rs](programs/justies/src/admin/init_justies_program.rs)
  * **Update program configs**
    * Authority can call the instruction to update program configs. 
    * Details: [update_configs.rs](programs/justies/src/admin/update_configs.rs)
  * **Allowlisting currency tokens**
    * Authority can add SPL tokens into an allowlist;
    * Details: [add_currency_token_to_allowlist.rs](programs/justies/src/admin/add_currency_token_to_allowlist.rs)
  * **Allowlisting NFT collections**
    * Authority can add NFT collections into an allowlist;
    * Details: [add_nft_collection_to_allowlist.rs](programs/justies/src/admin/add_nft_collection_to_allowlist.rs)
  * **Set mock timestamp** (testing-only)
    * Authority can call this instruction to set a mock timestamp.
    * Details: [set_mock_timestamp.rs](programs/justies/src/admin/set_mock_timestamp.rs)
* **Auction**
  * **Create auction**
    * Users call this instruction to create auctions.
    * Details: [create_auction.rs](programs/justies/src/auction/create_auction.rs)
  * **Cancel auction**
    * Creators can cancel the auction when there are no bids (no matter of the auction status);
    * Details: [cancel_auction.rs](programs/justies/src/auction/cancel_auction.rs)
  * **Make bid**
    * Users can make bid to an ongoing auction as long as all requirements (e.g.: minimum outbid rate,
    sufficient balance, NFT/token holders) are satisfied;
    * The bid within the last minutes may trigger auction auto-extension;
    * Details: [make_bid.rs](programs/justies/src/auction/make_bid.rs)
  * **Cancel bid**
    * The non-top-bidders can cancel their bids with their bid funds refunded;
    * Details: [cancel_auction_bid.rs](programs/justies/src/auction/cancel_auction_bid.rs)
  * **Claim the lot NFT**
    * The top-bidder can claim the lot NFT;
    * Details: [claim_lot_nft.rs](programs/justies/src/auction/claim_lot_nft.rs)
  * **Claim the auction revenue**
    * The creator can claim the revenue when the auction is ended;
    * Revenues will be distributed to Justies fee treasury and the specified revenue recipients with shares.
    * Details: [claim_auction_revenue.rs](programs/justies/src/auction/claim_auction_revenue.rs)
* **Raffle**
  * **Create raffle**
    * Users can create ticket-based raffles;
    * There can be multiple raffled NFTs (with SFT token standard) & winners;
    * Details: [create_raffle.rs](programs/justies/src/raffle/create_raffle.rs)
  * **Cancel raffle**
    * Creators can cancel the raffle when no raffle tickets are sold (no matter of the raffle status);
    * Details: [cancel_raffle.rs](programs/justies/src/raffle/cancel_raffle.rs)
  * **Buy raffle tickets**
    * Users can buy raffle tickets to participate the ongoing raffles;
    * Details: [buy_raffle_tickets.rs](programs/justies/src/raffle/buy_raffle_tickets.rs)
  * **Make raffle (authority-only)**
    * Make on-chain raffle to pick winners.
    * When running in test environment, can be run repeatedly for testing purpose.
    * Details: [make_raffle.rs](programs/justies/src/raffle/make_raffle.rs)
  * **Set raffle winners** (testing-only):
    * The authority can set winners for testing purpose;
    * Only callable when running in test environment;
    * Details: [set_raffle_winners.rs](programs/justies/src/raffle/set_raffle_winners.rs)
  * **Claim raffle reward**
    * The raffle winners can claim their rewards;
    * Details: [claim_raffle_reward.rs](programs/justies/src/raffle/claim_raffle_reward.rs)
  * **Claim raffle revenue**:
    * The raffle creators can claim the raffle revenues earned via selling tickets.
    * Revenues will be distributed to Justies fee treasury and the specified revenue recipients with shares.
    * Details: [claim_raffle_revenue.rs](programs/justies/src/raffle/claim_raffle_revenue.rs)
  * **Claim remaining raffle rewards**:
    * Creators can claim remaining raffle rewards if there are less raffle participants than the winners.
    * Details: [claim_remaining_raffle_rewards.rs](programs/justies/src/raffle/claim_remaining_raffle_rewards.rs)

## PDAs
* Global states
  * Contains all the global states and configs;
  * type: `GlobalStates`
  * seeds: PDA(`"global_states"`)
* Token allowlist
  * The allowlisting states for a given currency token;
  * type: `TokenAllowlistStates`
  * seeds: PDA(`"token_allowlist_states"`, `<token_mint_address>`)
* Token allowlist index:
  * Index of all the currency token allowlist states PDAs (for iteration purpose);
  * type: `PubkeyIndexPage`
  * seeds: PDA(`"token_allowlist_index"`, `<index_page_id>`)
* Nft allowlist
  * The allowlisting states for a given NFT collection;
  * type: `TokenAllowlistStates`
  * seeds: PDA(`"nft_allowlist_states"`, `<nft_collection_mint_address>`)
* Nft allowlist index (for iteration):
  * Index of all the nft collection allowlist states PDAs (for iteration purpose);
  * seeds: PDA(`"nft_allowlist_index"`, `<index_page_id>`)
* Auction
  * The auction states;
  * type: `Auction`
  * seeds: PDA(`"auction"`, `<auction_id>`)
* Lot escrow
  * The lot escrow NFT token account;
  * type: `TokenAccount`
  * authority: the auction PDA;
  * seeds: PDA(`"auction"`, `<auction_pda_address>`, `"lot_escrow"`)
* Bid
  * The bidding states for a bidder on an auction;
  * type: `AuctionBid`
  * seeds: PDA(`"auction"`, `<auction_pda_address>`, `"bid"`, `<bidder_address>`)
* Bid escrow
  * The escrow token account for the bidding funds;
  * type: `TokenAccount`
  * authority: the bid PDA;
  * seeds: PDA(`"auction"`, `<auction_pda_address>`, `"bid"`, `<bidder_address>`, `"escrow"`)
* Bid Index (for iteration)
  * Index of all the bids received by an auction (for iteration purpose);
  * seeds: PDA(`"auction"`, `<auction_pda_address>`, `"bid_index"`, `<index_page_id>`)
* Raffle
  * The raffle states;
  * type: `Raffle`;
  * seeds: PDA(`"raffle"`, `<raffle_id>`)
* Raffle rewards escrow
  * The rewards escrow NFT token account;
  * type: `TokenAccount`;
  * authority: the raffle PDA;
  * seeds: PDA(`"raffle"`, `<raffle_pda_address>`, `"rewards_escrow"`)
* Raffle revenue escrow
  * The revenue escrow token account;
  * type: `TokenAccount`;
  * authority: the raffle PDA;
  * seeds: PDA(`"raffle"`, `<raffle_pda_address>`, `"revenue_escrow"`)
* Raffle ticket position
  * The states for raffle participants' raffle ticket positions;
  * type: `RaffleTicketPosition`
  * seeds: PDA(`"raffle"`, `<raffle_pda_address>`, `"ticket_position"`, `<buyer_address>`)
* Raffle ticket position stats
  * A compact ticket positions stats account that can help on-chain raffle;
  * type: `TicketPositionStats`
  * seeds: PDA(`"raffle"`, `<raffle_pda_address>`, `"ticket_position_stats"`)
* Raffle ticket index
  * Index of all the participant ticket positions of a given raffle (for iteration purpose);
  * seeds: PDA(`"raffle"`, `<raffle_pda_address>`, `"ticket_position_index"`, `<index_page_id>`)

## Code structure
* `programs/justies/`: the Solana program codes;
    * `lib.rs`: the index to all the instructions;
  * `common/`: the common code utilities;
  * `admin/`: all the admin-related states & instructions;
  * `auction/`: all the auction-related states & instructions;
  * `raffle/`: all the raffle-related states & instructions;
* `libraries`: the Typescript libraries for Justies program client and dev environment helpers;
* `tests`: all the tests;
* `migrations`: all the scripts related to deploy;

## Run test

All the use cases are covered by test cases.  The test suite is fully self-contained. It is implemented as integration
tests with all dependent programs deployed and all test token data created in the local validator brought up by Anchor.

The tests are located at the `tests` subdir. To run them:

* Make sure you have installed the Rust & Solana & Anchor developing kits by following this
  [instruction](https://www.anchor-lang.com/docs/installation);
* Run `yarn` to install the node dependencies.
* Run `yarn test` to run all the tests.

