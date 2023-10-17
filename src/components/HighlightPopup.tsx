import React from "react";

interface Props {
  comment: { text: string; category: string };
}
const HighlightPopup = ({ comment }: Props) => {
  if (!comment?.text) return null;

  return (
    <div className="Highlight__popup">
      {comment.category} {comment.text}
    </div>
  );
};
export default HighlightPopup;
