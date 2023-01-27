use anchor_lang::prelude::error_code;

#[error_code]
pub enum JustiesErrorCode {
  #[msg("minimum outbid rate not met")]
  NotMetMinOutbidRate = 0,
  #[msg("start bid not met")]
  NotMetStartBid = 1,
  #[msg("insufficient funds for the bid")]
  InsufficientBidFunds = 2,
  #[msg("bid on an ended auction")]
  BidOnEndedAuction = 3,
  #[msg("the auction is still ongoing")]
  OngoingAuction = 4,
  #[msg("closing a token account with non-zero balance")]
  CloseNonZeroBalanceAccount = 6,
  #[msg("invalid revenue share config")]
  InvalidRevenueShareConfig = 7,
  #[msg("the raffle is ended")]
  RaffleEnded = 9,
  #[msg("the raffle is still ongoing")]
  RaffleOngoing = 10,
  #[msg("the raffle is already made")]
  RaffleAlreadyMade = 11,
  #[msg("not a raffle winner")]
  NotARaffleWinner = 12,
  #[msg("the raffle reward has been claimed")]
  RaffleRewardClaimed = 13,
  #[msg("the raffle is not made")]
  RaffleNotMade = 14,
  #[msg("the revenue distribution account doesn't match")]
  RevenueDistributionAccountsDoesntMatch = 15,
  #[msg("the feature is not implemented yet")]
  NotImplemented = 16,
  #[msg("not enough payload accounts")]
  NotEnoughPayloadAccounts = 17,
  #[msg("invalid eligibility checking accounts")]
  InvalidEligibilityCheckingAccount = 18,
  #[msg("the signer is not eligible for the operations")]
  Ineligible = 19,
  #[msg("invalid number of raffled NFTs")]
  InvalidNumRaffledNfts = 20,
  #[msg("invalid raffle ticket supply")]
  InvalidRaffleTicketSupply = 21,
  #[msg("invalid raffle duration")]
  InvalidRaffleDuration = 22,
  #[msg("not the auction creator")]
  NotAuctionCreator = 23,
  #[msg("not the raffle creator")]
  NotRaffleCreator = 24,
  #[msg("the auction is not cancelable")]
  AuctionNotCancelable = 25,
  #[msg("the raffle is not cancelable")]
  RaffleNotCancelable = 26,
  #[msg("the provided nft mint address mismatches the stored one")]
  NftMintAddressMismatch = 27,
  #[msg("the auction has been cancelled")]
  AuctionCancelled = 28,
  #[msg("the raffle has been cancelled")]
  RaffleCancelled = 29,
  #[msg("the raffle winner number is invalid")]
  InvalidRaffleWinnerNumber = 30,
  #[msg("there are no remaining raffle rewards left")]
  NoRemainingRaffleRewards = 31,
  #[msg("the auction creator cannot make bid")]
  AuctionCreatorCannotMakeBid = 32,
  #[msg("the raffle creator cannot buy tickets")]
  RaffleCreatorCannotBuyTickets = 33,
  #[msg("the signer is not the authority")]
  NotTheAuthority = 34,
  #[msg("the market fee rate bps setting is invalid")]
  InvalidMarketFeeRate = 35,
  #[msg("the auction extension settings are invalid")]
  InvalidAuctionExtensionSettings = 36,
  #[msg("the auction duration range settings are invalid")]
  InvalidAuctionDurationRangeSettings = 37,
  #[msg("the raffle ticket supply range settings are invalid")]
  InvalidRaffleTicketSupplyRangeSettings = 38,
  #[msg("the raffle duration range settings are invalid")]
  InvalidRaffleDurationRangeSettings = 39,
  #[msg("the min outbid rate bps settings is invalid")]
  InvalidMinOutbidRate = 40,
  #[msg("the program data is invalid")]
  InvalidProgramData = 41,
  #[msg("the specified fee treasury address is invalid")]
  InvalidFeeTreasuryAddress = 42,
  #[msg("the specified currency token mint account is invalid")]
  InvalidCurrencyTokenMint = 43,
  #[msg("the specified nft collection mint account is invalid")]
  InvalidNftCollectionMint = 44,
  #[msg("the specified nft collection metadata is invalid")]
  InvalidNftCollectionMetadata = 45,
  #[msg("the program is not running in an test environment")]
  NotTestEnvironment = 46,
  #[msg("the current signer is ineligible to claim revenue")]
  IneligibleToClaimRevenue = 47,
  #[msg("the provided bid escrow account state is inconsistent with top bid states in the auction.")]
  InconsistentBidEscrowAccountState = 48,
  #[msg("the current signer is ineligible to claim the lot nft")]
  IneligibleToClaimLotNft = 49,
  #[msg("the specified bid account is invalid")]
  InvalidBidAccount = 50,
  #[msg("the lot escrow nft account contains inconsistent states")]
  InconsistentLotEscrowNftAccount = 51,
  #[msg("the specified nft mint account is invalid")]
  InvalidNftMint = 52,
  #[msg("invalid auction duration")]
  InvalidAuctionDuration = 53,
  #[msg("invalid auction id")]
  InvalidAuctionId = 54,
  #[msg("invalid revenue recipient number")]
  InvalidRevenueRecipientNumber = 55,
  #[msg("invalid auction creator nft account states")]
  InvalidAuctionCreatorNftAccount = 56,
  #[msg("invalid nft metadata")]
  InvalidNftMetadata = 57,
  #[msg("the nft collection is not in the allowlist")]
  NftCollectionNotInAllowlist = 58,
  #[msg("the token is not in the allowlist")]
  TokenNotInAllowlist = 59,
  #[msg("the bid amount is invalid")]
  InvalidBidAmount = 60,
  #[msg("invalid bidder token account")]
  InvalidBidderTokenAccount = 61,
  #[msg("the signer is not the bidder")]
  NotTheBidder = 62,
  #[msg("the top bidder cannot cancel bid")]
  TopBidderCannotCancelBid = 63,
  #[msg("the bid escrow token account contains inconsistent states")]
  InconsistentBidEscrowTokenAccount = 64,
  #[msg("invalid raffle ticket sale id")]
  InvalidRaffleTicketSaleId = 65,
  #[msg("invalid raffle ticket number to buy")]
  InvalidRaffleTicketNumber = 66,
  #[msg("invalid ticket buyer token account")]
  InvalidTicketBuyerTokenAccount = 67,
  #[msg("invalid raffle id")]
  InvalidRaffleId = 68,
  #[msg("invalid raffle creator nft account")]
  InvalidRaffleCreatorNftAccount = 69,
  #[msg("the raffle ticket position account contains inconsistent states")]
  InconsistentRaffleTicketPosition = 70,
  #[msg("auction creation is disabled")]
  AuctionCreationDisabled = 71,
  #[msg("raffle creation is disabled")]
  RaffleCreationDisabled = 72,
}
