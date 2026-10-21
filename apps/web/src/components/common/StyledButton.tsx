import styled, { css } from 'styled-components';

export type ButtonVariant = 'primary' | 'secondary' | 'sage' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  $variant?: ButtonVariant;
  $size?: ButtonSize;
  $fullWidth?: boolean;
}

export const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 600;
  border-radius: 1rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: 1px solid transparent;
  width: ${(props) => (props.$fullWidth ? '100%' : 'auto')};

  /* Sizes */
  ${(props) => {
    switch (props.$size) {
      case 'sm':
        return css`
          padding: 0.5rem 0.875rem;
          font-size: 0.875rem;
        `;
      case 'lg':
        return css`
          padding: 0.875rem 1.75rem;
          font-size: 1.125rem;
          border-radius: 1.25rem;
        `;
      case 'md':
      default:
        return css`
          padding: 0.625rem 1.25rem;
          font-size: 0.95rem;
        `;
    }
  }}

  /* Variants */
  ${(props) => {
    switch (props.$variant) {
      case 'secondary':
        return css`
          background: #f5f5f4;
          color: #292524;
          &:hover {
            background: #e7e5e4;
            transform: translateY(-1px);
          }
          &:active {
            transform: translateY(0);
          }
        `;
      case 'sage':
        return css`
          background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
          color: white;
          box-shadow: 0 4px 14px -2px rgba(20, 184, 166, 0.35);
          &:hover {
            box-shadow: 0 6px 20px -2px rgba(20, 184, 166, 0.45);
            transform: translateY(-2px);
          }
          &:active {
            transform: translateY(0);
          }
        `;
      case 'outline':
        return css`
          background: transparent;
          border-color: #e7e5e4;
          color: #44403c;
          &:hover {
            background: #fafaf9;
            border-color: #d6d3d1;
            color: #1c1917;
            transform: translateY(-1px);
          }
        `;
      case 'ghost':
        return css`
          background: transparent;
          color: #57534e;
          &:hover {
            background: rgba(0, 0, 0, 0.04);
            color: #1c1917;
          }
        `;
      case 'danger':
        return css`
          background: #ffe4e6;
          color: #e11d48;
          &:hover {
            background: #fecdd3;
            transform: translateY(-1px);
          }
        `;
      case 'primary':
      default:
        return css`
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          box-shadow: 0 4px 15px -2px rgba(249, 115, 22, 0.4);
          &:hover {
            box-shadow: 0 8px 25px -4px rgba(249, 115, 22, 0.5);
            transform: translateY(-2px);
          }
          &:active {
            transform: translateY(0);
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }
`;
