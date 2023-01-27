use crate::admin::state::GlobalStates;
use crate::auction::state::Auction;
use crate::common::PubkeyIndexPage;
use crate::raffle::state::Raffle;
use anchor_lang::prelude::*;

/// Initializes the Justies program.
///
/// During initialization only a few params can be set explicitly, and all the
/// the other options will be set to the default values.
///
/// The signer of the 1st init instruction call become the default authority.
/// The authority can later be re-assigned.
#[derive(Accounts)]
#[instruction(
    market_fee_rate_bps: u16,
    fee_treasury_address: Pubkey,
    is_test_environment: bool,
)]
pub struct InitJustiesProgram<'info> {
  #[account(
      init,
      payer = authority,
      space = 8 + GlobalStates::MAX_DATA_SIZE,
      seeds = [b"global_states"],
      bump,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(mut)]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitJustiesProgram>,
  market_fee_rate_bps: u16,
  fee_treasury_address: Pubkey,
  is_test_environment: bool,
) -> Result<()> {
  let global_states = &mut ctx.accounts.global_states;

  global_states.bump = *ctx.bumps.get("global_states").unwrap();
  global_states.market_fee_rate_bps = market_fee_rate_bps;
  global_states.fee_treasury_address = fee_treasury_address;
  // The 1st signer that initializes the program become the authority.
  // This is acceptable as even if someone else init justies program right after
  // the creation of this program, it's still possible to close the account as
  // the upgrade authority.
  //
  // Please note that the authority is **immutable** after being initialized for
  // safety-reason.
  global_states.authority = ctx.accounts.authority.key();
  // 5% min outbid rate.
  global_states.min_outbid_rate_bps = 500;
  // Extend the auction if any bids made in the last 10 minutes.
  global_states.last_minutes_for_auction_extend = 10;
  // Extend for another 10 minutes if auction is extended.
  global_states.auction_extend_minutes = 10;
  global_states.min_auction_duration = Auction::MIN_DURATION;
  global_states.max_auction_duration = Auction::MAX_DURATION;
  global_states.min_raffle_ticket_supply = Raffle::MIN_RAFFLE_TICKETS_SUPPLY;
  global_states.max_raffle_ticket_supply = Raffle::MAX_RAFFLE_TICKETS_SUPPLY;
  global_states.max_raffled_nfts = Raffle::MAX_RAFFLED_NFTS;
  global_states.min_raffle_duration = Raffle::MIN_DURATION;
  global_states.max_raffle_duration = Raffle::MAX_DURATION;
  global_states.auction_creation_enabled = true;
  global_states.raffle_creation_enabled = true;
  global_states.num_keys_per_index_page = PubkeyIndexPage::KEYS_PER_PAGE as u16;
  global_states.is_test_environment = is_test_environment;

  Ok(())
}
