use crate::admin::GlobalStates;
use crate::common::{get_current_timestamp, JustiesErrorCode, RaffleStrategy};
use crate::raffle::{Raffle, TicketPositionStats};
use anchor_lang::prelude::*;

/// Makes raffle to pick winners.
///
/// The "rerun" flag is for testing purpose. It can only be true when
/// global_states.is_test_environment == true. When being true, the raffle
/// algorithm will be rerun. This is useful for testing the raffle algorithm.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
    rerun: bool,
)]
pub struct MakeRaffle<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      mut,
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position_stats",
      ],
      bump = ticket_position_stats.bump,
  )]
  pub ticket_position_stats: Box<Account<'info, TicketPositionStats>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
      constraint = global_states.authority == authority.key() @JustiesErrorCode::NotTheAuthority,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MakeRaffle>, rerun: bool) -> Result<()> {
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  raffle_strategy.validate_make_raffle(current_timestamp, rerun)?;
  raffle_strategy
    .make_raffle(&ctx.accounts.ticket_position_stats.ticket_positions);
  Ok(())
}
