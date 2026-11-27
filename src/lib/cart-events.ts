/**
 * Dispatched on `window` whenever the member's cart changes (add, size/note update, remove,
 * send). The header badge re-reads GET /api/cart; the cart page refreshes its list.
 */
export const CART_CHANGED_EVENT = "cart:changed";
