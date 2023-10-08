import React from "react";

interface Props {
  onMouseOver: (content: JSX.Element) => void;
  popupContent: JSX.Element;
  onMouseOut: () => void;
  children: JSX.Element;
}

export const Popup = ({
  onMouseOver,
  popupContent,
  onMouseOut,
  children,
}: Props) => {
  return (
    <div
      className="Popup"
      onMouseEnter={() => {
        onMouseOver(popupContent);
      }}
      onMouseLeave={() => {
        onMouseOut();
      }}
    >
      {children}
    </div>
  );
};

export default Popup;
