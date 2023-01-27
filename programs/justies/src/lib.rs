extern crate core;

use anchor_lang::prelude::*;

mod admin;
use admin::*;
mod auction;
use auction::*;
mod common;
use common::*;

mod raffle;

use raffle::*;

declare_id!("4PMBVVw4YG1Cmni7zABSdJ2Z4AAatQBDzJFisfZ3M6Rd");

#[program]
pub mod justies {
  use super::*;

  //////////////////////////////////////////////////////////////////////////////
  // Admin Instructions
  //////////////////////////////////////////////////////////////////////////////

  pub fn set_mock_timestamp(
    ctx: Context<SetMockTimestamp>,
    mock_timestamp: Option<i64>,
  ) -> Result<()> {
    admin::set_mock_timestamp::handler(ctx, mock_timestamp)
  }

  pub fn init_justies_program(
    ctx: Context<InitJustiesProgram>,
    market_fee_rate_bps: u16,
    fee_treasury_address: Pubkey,
    is_test_environment: bool,
  ) -> Result<()> {
    admin::init_justies_program::handler(
      ctx,
      market_fee_rate_bps,
      fee_treasury_address,
      is_test_environment,
    )
  }

  pub fn update_configs(
    ctx: Context<UpdateConfigs>,
    input: UpdateConfigsInput,
  ) -> Result<()> {
    admin::update_configs::handler(ctx, input)
  }

  pub fn add_currency_token_to_allowlist(
    ctx: Context<AddCurrencyTokenToAllowList>,
    token_mint_address: Pubkey,
  ) -> Result<()> {
    admin::add_currency_token_to_allowlist::handler(ctx, token_mint_address)
  }

  pub fn add_nft_collection_to_allowlist(
    ctx: Context<AddNftCollectionToAllowList>,
    collection_mint_address: Pubkey,
  ) -> Result<()> {
    admin::add_nft_collection_to_allowlist::handler(
      ctx,
      collection_mint_address,
    )
  }

  //////////////////////////////////////////////////////////////////////////////
  // Auction Instructions
  //////////////////////////////////////////////////////////////////////////////

  pub fn create_auction(
    ctx: Context<CreateAuction>,
    id: u64,
    duration: i64,
    start_bid: u64,
    eligible_groups: Vec<GroupConfig>,
    revenue_shares: Vec<RevenueShareConfig>,
  ) -> Result<()> {
    auction::create_auction::handler(
      ctx,
      id,
      duration,
      start_bid,
      eligible_groups,
      revenue_shares,
    )
  }

  pub fn cancel_auction(
    ctx: Context<CancelAuction>,
    _auction_id: u64,
  ) -> Result<()> {
    auction::cancel_auction::handler(ctx)
  }

  pub fn make_bid(
    ctx: Context<MakeBid>,
    auction_id: u64,
    bid_amount: u64,
    max_allowed_bid_amount: u64,
    eligibility_check_input: Option<EligibilityCheckInput>,
  ) -> Result<()> {
    auction::make_bid::handler(
      ctx,
      auction_id,
      bid_amount,
      max_allowed_bid_amount,
      eligibility_check_input,
    )
  }

  pub fn claim_lot_nft(
    ctx: Context<ClaimLotNft>,
    auction_id: u64,
  ) -> Result<()> {
    auction::claim_lot_nft::handler(ctx, auction_id)
  }

  pub fn cancel_auction_bid(
    ctx: Context<CancelAuctionBid>,
    _auction_id: u64,
  ) -> Result<()> {
    auction::cancel_auction_bid::handler(ctx)
  }

  pub fn claim_auction_revenue<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimAuctionRevenue<'info>>,
    auction_id: u64,
  ) -> Result<()> {
    auction::claim_auction_revenue::handler(ctx, auction_id)
  }

  //////////////////////////////////////////////////////////////////////////////
  // Raffle Instructions
  //////////////////////////////////////////////////////////////////////////////

  pub fn create_raffle(
    ctx: Context<CreateRaffle>,
    id: u64,
    duration: i64,
    ticket_supply: u16,
    ticket_price: u64,
    num_raffled_nfts: u8,
    eligible_groups: Vec<GroupConfig>,
    revenue_shares: Vec<RevenueShareConfig>,
  ) -> Result<()> {
    raffle::create_raffle::handler(
      ctx,
      id,
      duration,
      ticket_supply,
      ticket_price,
      num_raffled_nfts,
      eligible_groups,
      revenue_shares,
    )
  }

  pub fn cancel_raffle(
    ctx: Context<CancelRaffle>,
    _raffle_id: u64,
  ) -> Result<()> {
    raffle::cancel_raffle::handler(ctx)
  }

  pub fn buy_raffle_tickets(
    ctx: Context<BuyRaffleTickets>,
    _raffle_id: u64,
    num_tickets: u16,
    eligibility_check_input: Option<EligibilityCheckInput>,
  ) -> Result<()> {
    raffle::buy_raffle_tickets::handler(
      ctx,
      num_tickets,
      eligibility_check_input,
    )
  }

  pub fn make_raffle(
    ctx: Context<MakeRaffle>,
    _raffle_id: u64,
    rerun: bool,
  ) -> Result<()> {
    raffle::make_raffle::handler(ctx, rerun)
  }

  pub fn set_raffle_winners(
    ctx: Context<SetRaffleWinners>,
    _raffle_id: u64,
    winner_ids: Vec<u16>,
  ) -> Result<()> {
    raffle::set_raffle_winners::handler(ctx, winner_ids)
  }

  pub fn claim_raffle_reward(
    ctx: Context<ClaimRaffleReward>,
    _raffle_id: u64,
  ) -> Result<()> {
    raffle::claim_raffle_reward::handler(ctx)
  }

  pub fn claim_raffle_revenue<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimRaffleRevenue<'info>>,
    raffle_id: u64,
  ) -> Result<()> {
    raffle::claim_raffle_revenue::handler(ctx, raffle_id)
  }

  pub fn claim_remaining_raffle_rewards(
    ctx: Context<ClaimRemainingRaffleRewards>,
    _raffle_id: u64,
  ) -> Result<()> {
    raffle::claim_remaining_raffle_rewards::handler(ctx)
  }
}
