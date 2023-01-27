use crate::admin::{GlobalStates, UpdateConfigsInput};
use crate::common::JustiesErrorCode;
use anchor_lang::prelude::*;

macro_rules! try_update_config {
  ($input:ident, $global_states:ident, $property_name:ident) => {
    match $input.$property_name {
      Some(value) => {
        $global_states.$property_name = value;
      }
      _ => {}
    }
  };
}

pub struct ConfigsStrategy<'accounts, 'info> {
  pub global_states: &'accounts mut Account<'info, GlobalStates>,
}

impl<'accounts, 'info> ConfigsStrategy<'accounts, 'info> {
  pub fn new(
    global_states: &'accounts mut Account<'info, GlobalStates>,
  ) -> Self {
    Self { global_states }
  }

  pub fn update_configs(&mut self, input: &UpdateConfigsInput) {
    let global_states = &mut self.global_states;
    try_update_config!(input, global_states, market_fee_rate_bps);
    try_update_config!(input, global_states, fee_treasury_address);
    try_update_config!(input, global_states, min_outbid_rate_bps);
    try_update_config!(input, global_states, last_minutes_for_auction_extend);
    try_update_config!(input, global_states, auction_extend_minutes);
    try_update_config!(input, global_states, min_auction_duration);
    try_update_config!(input, global_states, max_auction_duration);
    try_update_config!(input, global_states, min_raffle_ticket_supply);
    try_update_config!(input, global_states, max_raffle_ticket_supply);
    try_update_config!(input, global_states, max_raffled_nfts);
    try_update_config!(input, global_states, min_raffle_duration);
    try_update_config!(input, global_states, max_raffle_duration);
    try_update_config!(input, global_states, auction_creation_enabled);
    try_update_config!(input, global_states, raffle_creation_enabled);
    if global_states.is_test_environment {
      try_update_config!(input, global_states, num_keys_per_index_page);
    }
  }

  pub fn validate(&self) -> Result<()> {
    let global_states = &*self.global_states;
    if global_states.market_fee_rate_bps >= 10000 {
      return err!(JustiesErrorCode::InvalidMarketFeeRate);
    }
    if global_states.min_outbid_rate_bps == 0
      || global_states.min_outbid_rate_bps >= 10000
    {
      return err!(JustiesErrorCode::InvalidMinOutbidRate);
    }
    if global_states.last_minutes_for_auction_extend == 0
      || global_states.auction_extend_minutes == 0
    {
      return err!(JustiesErrorCode::InvalidAuctionExtensionSettings);
    }
    if global_states.min_auction_duration == 0
      || global_states.max_auction_duration == 0
      || global_states.min_auction_duration
        >= global_states.max_auction_duration
    {
      return err!(JustiesErrorCode::InvalidAuctionDurationRangeSettings);
    }
    if global_states.min_raffle_ticket_supply == 0
      || global_states.max_raffle_ticket_supply == 0
      || global_states.min_raffle_ticket_supply
        >= global_states.max_raffle_ticket_supply
    {
      return err!(JustiesErrorCode::InvalidRaffleTicketSupplyRangeSettings);
    }
    if global_states.min_raffle_duration == 0
      || global_states.max_raffle_duration == 0
      || global_states.min_raffle_duration >= global_states.max_raffle_duration
    {
      return err!(JustiesErrorCode::InvalidRaffleDurationRangeSettings);
    }
    Ok(())
  }
}
