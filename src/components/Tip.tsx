import React, { useState } from "react";

import "../style/Tip.css";

interface Props {
  onConfirm: (comment: { text: string; category: string }) => void;
  onOpen: () => void;
  categoryLabels: Array<{ label: string; background: string }>;
}

export const Tip = ({ onConfirm, onOpen, categoryLabels }: Props) => {
  const [compact, setCompact] = useState(true);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");

  return (
    <div className="Tip">
      {compact ? (
        <div
          className="Tip__compact"
          onClick={() => {
            onOpen();
            setCompact(false);
          }}
        >
          Add highlight
        </div>
      ) : (
        <form
          className="Tip__card"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({ text, category: category });
          }}
        >
          <div className="Tip__content">
            <textarea
              placeholder="Your comment"
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              ref={(node) => {
                if (node) {
                  node.focus();
                }
              }}
            />

            <div className="Tip__list">
              {categoryLabels.map((_category) => (
                <label key={_category.label} className="Tip__list-item">
                  <input
                    checked={category === _category.label}
                    type="radio"
                    name="category"
                    value={_category.label}
                    onChange={(event) => setCategory(event.target.value)}
                  />
                  {_category.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <input type="submit" value="Save" />
          </div>
        </form>
      )}
    </div>
  );
};

export default Tip;
