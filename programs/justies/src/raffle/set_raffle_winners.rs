use crate::admin::GlobalStates;
use crate::common::{get_current_timestamp, JustiesErrorCode, RaffleStrategy};
use crate::raffle::Raffle;
use anchor_lang::prelude::*;

/// Sets raffle winners (testing-only).
///
/// Only callable by the authority when global_states.is_test_environment is
/// true. This is for setting up deterministic winners for testing purpose.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
    winner_ids: Vec<u16>,
)]
pub struct SetRaffleWinners<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
      constraint = global_states.is_test_environment == true @JustiesErrorCode::NotTestEnvironment,
      constraint = global_states.authority == authority.key() @JustiesErrorCode::NotTheAuthority,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<SetRaffleWinners>,
  winner_ids: Vec<u16>,
) -> Result<()> {
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  raffle_strategy.validate_set_winners(current_timestamp)?;
  raffle_strategy.set_winners(&winner_ids);
  Ok(())
}
