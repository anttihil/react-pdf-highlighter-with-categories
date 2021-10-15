import React, { Component } from "react";

import "../style/Tip.css";

interface State {
  compact: boolean;
  text: string;
  category: string;
}

interface Props {
  onConfirm: (comment: { text: string; category: string }) => void;
  onOpen: () => void;
  onUpdate?: () => void;
  categoryLabels: Array<{ label: string; background: string }>;
}

export class Tip extends Component<Props, State> {
  state: State = {
    compact: true,
    text: "",
    category: "",
  };

  // for TipContainer
  componentDidUpdate(nextProps: Props, nextState: State) {
    const { onUpdate } = this.props;

    if (onUpdate && this.state.compact !== nextState.compact) {
      onUpdate();
    }
  }

  render() {
    const { onConfirm, onOpen, categoryLabels } = this.props;
    const { compact, text, category: category } = this.state;

    return (
      <div className="Tip">
        {compact ? (
          <div
            className="Tip__compact"
            onClick={() => {
              onOpen();
              this.setState({ compact: false });
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
            <div>
              <textarea
                placeholder="Your comment"
                autoFocus
                value={text}
                onChange={(event) =>
                  this.setState({ text: event.target.value })
                }
                ref={(node) => {
                  if (node) {
                    node.focus();
                  }
                }}
              />
              <div>
                {categoryLabels.map((_category) => (
                  <label key={_category.label}>
                    <input
                      checked={category === _category.label}
                      type="radio"
                      name="category"
                      value={_category.label}
                      onChange={(event) =>
                        this.setState({ category: event.target.value })
                      }
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
  }
}

export default Tip;
