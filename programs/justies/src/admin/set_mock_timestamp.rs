use crate::admin::state::GlobalStates;
use crate::common::JustiesErrorCode;
use anchor_lang::prelude::*;

/// Sets mock timestamp.
///
/// This is only callable when is_test_environment == true.
///
/// The reason to add this is that it is necessary to forward the timestamp to
/// testing time-related smart contract behaviors. However solana test validator
/// doesn't provide a feasible way to mock the timestamp. It is a walk around to
/// support timestamp mocking at the application-level.
///
/// Only callable by the authority.
#[derive(Accounts)]
#[instruction(
    mock_timestamp: Option<i64>,
)]
pub struct SetMockTimestamp<'info> {
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
      constraint = global_states.is_test_environment == true @JustiesErrorCode::NotTestEnvironment,
      constraint = global_states.authority == authority.key() @JustiesErrorCode::NotTheAuthority,
  )]
  pub global_states: Account<'info, GlobalStates>,
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<SetMockTimestamp>,
  mock_timestamp: Option<i64>,
) -> Result<()> {
  let global_states = &mut ctx.accounts.global_states;
  global_states.mock_timestamp = mock_timestamp;
  Ok(())
}
