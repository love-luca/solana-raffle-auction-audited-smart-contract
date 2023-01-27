use crate::admin::GlobalStates;
use anchor_lang::prelude::*;

pub fn get_current_timestamp(global_states: &Account<GlobalStates>) -> i64 {
  let real_timestamp = Clock::get().unwrap().unix_timestamp;
  if !global_states.is_test_environment {
    return real_timestamp;
  }

  match global_states.mock_timestamp {
    None => real_timestamp,
    Some(mock_timestamp) => mock_timestamp,
  }
}
