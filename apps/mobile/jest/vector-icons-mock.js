// jest-expo does not load icon fonts. Icons are decorative (no accessible
// name of their own), so render nothing and let the surrounding text/roles
// carry the accessibility tree.
const Icon = () => null;

module.exports = {
  Ionicons: Icon,
  FontAwesome: Icon,
  MaterialIcons: Icon,
  __esModule: true,
  default: Icon,
};
