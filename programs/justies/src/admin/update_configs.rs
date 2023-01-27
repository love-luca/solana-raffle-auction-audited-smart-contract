use crate::admin::GlobalStates;
use crate::common::{ConfigsStrategy, JustiesErrorCode};
use anchor_lang::prelude::*;

/// The input type for the UpdateConfigs instruction.
///
/// All fields are optional so that only non-empty values are updated at the
/// global_states account.
#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, PartialEq)]
pub struct UpdateConfigsInput {
  pub market_fee_rate_bps: Option<u16>,
  pub fee_treasury_address: Option<Pubkey>,
  pub min_outbid_rate_bps: Option<u16>,
  pub last_minutes_for_auction_extend: Option<u8>,
  pub auction_extend_minutes: Option<u8>,
  pub min_auction_duration: Option<u64>,
  pub max_auction_duration: Option<u64>,
  pub min_raffle_ticket_supply: Option<u16>,
  pub max_raffle_ticket_supply: Option<u16>,
  pub max_raffled_nfts: Option<u8>,
  pub min_raffle_duration: Option<u64>,
  pub max_raffle_duration: Option<u64>,
  pub auction_creation_enabled: Option<bool>,
  pub raffle_creation_enabled: Option<bool>,
  // This can only be set when is_test_environment == true for safety purpose.
  pub num_keys_per_index_page: Option<u16>,
}

/// Updates program configs.
///
/// Only callable by the authority.
#[derive(Accounts)]
#[instruction(
    input: UpdateConfigsInput,
)]
pub struct UpdateConfigs<'info> {
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(
      constraint = authority.key() == global_states.authority @JustiesErrorCode::NotTheAuthority,
  )]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<UpdateConfigs>,
  input: UpdateConfigsInput,
) -> Result<()> {
  let mut configs_strategy =
    ConfigsStrategy::new(&mut ctx.accounts.global_states);
  configs_strategy.update_configs(&input);
  configs_strategy.validate()?;
  Ok(())
}
