import styled, { css } from 'styled-components';

interface CardProps {
  $glow?: boolean;
  $interactive?: boolean;
  $padded?: boolean;
  $dark?: boolean;
}

export const StyledCard = styled.div<CardProps>`
  background: ${(props) =>
    props.$dark
      ? 'rgba(28, 25, 23, 0.85)'
      : 'rgba(255, 255, 255, 0.85)'};
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid
    ${(props) =>
      props.$dark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(255, 255, 255, 0.7)'};
  border-radius: 1.5rem;
  box-shadow: ${(props) =>
    props.$dark
      ? '0 10px 30px -5px rgba(0, 0, 0, 0.4)'
      : '0 10px 30px -5px rgba(249, 115, 22, 0.05), 0 4px 10px -2px rgba(0, 0, 0, 0.03)'};
  padding: ${(props) => (props.$padded !== false ? '1.5rem' : '0')};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  ${(props) =>
    props.$interactive &&
    css`
      cursor: pointer;
      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 20px 35px -10px rgba(249, 115, 22, 0.15),
          0 10px 15px -3px rgba(0, 0, 0, 0.04);
        border-color: rgba(249, 115, 22, 0.3);
      }
    `}

  ${(props) =>
    props.$glow &&
    css`
      box-shadow: 0 0 30px -5px rgba(249, 115, 22, 0.25);
      border-color: rgba(249, 115, 22, 0.4);
    `}
`;

export const GlassContainer = styled.div`
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 2rem;
  box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.05);
`;
