/**
 * Who is selling, shown on legal pages as UK law requires. Set in the hosting
 * environment rather than in this public repository, so forks never inherit
 * the owner's details and a home address stays out of git history.
 */
export const SELLER = {
  name: process.env.SELLER_LEGAL_NAME?.trim() ?? "",
  address: process.env.SELLER_ADDRESS?.trim() ?? "",
  vatNumber: process.env.SELLER_VAT_NUMBER?.trim() ?? "",
};

export const sellerConfigured = Boolean(SELLER.name && SELLER.address);
