// jest-expo does not load icon fonts, so render icon names as text instead.
const React = require('react');
const { Text } = require('react-native');

function Icon({ name, ...props }) {
  return React.createElement(Text, { ...props, testID: `icon-${name}` }, name);
}

module.exports = { Ionicons: Icon, FontAwesome: Icon, MaterialIcons: Icon };
