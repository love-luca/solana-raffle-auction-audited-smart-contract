use crate::common::{
  JustiesErrorCode, EligibilityCheckInput, GroupConfig, GroupType,
};
use anchor_lang::prelude::*;
use anchor_spl::metadata::MetadataAccount;
use anchor_spl::token::TokenAccount;
use mpl_token_metadata::solana_program::account_info::AccountInfo;

// Business logic on auction/raffle eligibility check.
pub struct EligibilityCheckStrategy<'info> {
  pub eligible_groups: Vec<GroupConfig>,
  pub group_type: Option<GroupType>,
  pub token_account: Option<Account<'info, TokenAccount>>,
  pub metadata_account: Option<Account<'info, MetadataAccount>>,
}

impl<'info> EligibilityCheckStrategy<'info> {
  pub fn new(
    eligible_groups: &Vec<GroupConfig>,
    signer: Pubkey,
    eligibility_check_input: Option<EligibilityCheckInput>,
    account_payloads: &[AccountInfo<'info>],
  ) -> Result<Self> {
    let mut result = EligibilityCheckStrategy {
      eligible_groups: eligible_groups.clone(),
      group_type: None,
      token_account: None,
      metadata_account: None,
    };

    match &eligibility_check_input {
      None => {
        return Ok(result);
      }
      Some(input) => {
        result.group_type = Some(input.group_type);
      }
    }

    match result.group_type.as_ref().unwrap() {
      GroupType::NftHolderGroup => {
        if account_payloads.len() < 2 {
          return err!(JustiesErrorCode::NotEnoughPayloadAccounts);
        }
        result.token_account = Some(Account::try_from(&account_payloads[0])?);
        result.metadata_account =
          Some(Account::try_from(&account_payloads[1])?);
        let token_account = result.token_account.as_ref().unwrap();
        let metadata_account = result.metadata_account.as_ref().unwrap();

        // Verifies that the metadata account is the one for the token.
        if token_account.mint != metadata_account.mint {
          return err!(JustiesErrorCode::InvalidEligibilityCheckingAccount);
        }

        // Verifies that the token metadata has verified collection info.
        let collection = &metadata_account.collection;
        if *collection == None || !collection.as_ref().unwrap().verified {
          return err!(JustiesErrorCode::InvalidEligibilityCheckingAccount);
        }
      }
      GroupType::TokenHolderGroup => {
        if account_payloads.len() < 1 {
          return err!(JustiesErrorCode::NotEnoughPayloadAccounts);
        }
        result.token_account = Some(Account::try_from(&account_payloads[0])?);
      }
      // TODO: implement me in v2
      GroupType::OffChainNftGroup => {
        return err!(JustiesErrorCode::NotImplemented);
      }
    }

    let token_account = result.token_account.as_ref().unwrap();
    // Verifies that the signer owns the eligibility checking token accounts.
    if signer != token_account.owner || token_account.amount == 0 {
      return err!(JustiesErrorCode::InvalidEligibilityCheckingAccount);
    }

    Ok(result)
  }

  pub fn check_eligibility(&self) -> Result<()> {
    if self.eligible_groups.is_empty() {
      return Ok(());
    }

    if self.group_type == None {
      return err!(JustiesErrorCode::Ineligible);
    }

    match self.group_type.unwrap() {
      GroupType::NftHolderGroup => {
        self.check_group_membership(Self::is_nft_holder)?;
      }
      GroupType::TokenHolderGroup => {
        self.check_group_membership(Self::is_token_holder)?;
      }
      // TODO: implement me in v2
      GroupType::OffChainNftGroup => {
        return err!(JustiesErrorCode::Ineligible);
      }
    }
    Ok(())
  }

  fn check_group_membership<IsGroupMemberFn>(
    &self,
    is_group_member_fn: IsGroupMemberFn,
  ) -> Result<()>
  where
    IsGroupMemberFn: Fn(&Self, &GroupConfig) -> bool,
  {
    let is_eligible = self
      .eligible_groups
      .iter()
      .any(|group| is_group_member_fn(self, group));
    if !is_eligible {
      return err!(JustiesErrorCode::Ineligible);
    }
    Ok(())
  }

  fn is_nft_holder(&self, group: &GroupConfig) -> bool {
    let metadata_account = self.metadata_account.as_ref().unwrap();
    let collection = metadata_account.collection.as_ref().unwrap();
    group.group_type == GroupType::NftHolderGroup && group.key == collection.key
  }

  fn is_token_holder(&self, group: &GroupConfig) -> bool {
    group.group_type == GroupType::TokenHolderGroup
      && group.key == self.token_account.as_ref().unwrap().mint
  }
}
