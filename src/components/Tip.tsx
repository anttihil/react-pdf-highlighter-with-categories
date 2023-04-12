import React, { Component } from "react";

import "../style/Tip.css";
import {
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
} from "@mui/material";

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
  tipBackgroundColor: string;
  tipColor: string;
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
    const { onConfirm, onOpen, categoryLabels , tipBackgroundColor = "#D3D3D3", tipColor = "black"} = this.props;
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
          <Box
            component="form"
            sx={{ background: tipBackgroundColor, color:tipColor }}
            className="Tip__card"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm({ text, category: category });
            }}
          >
            <div className="Tip__content">
              <TextField
                placeholder="Your comment"
                multiline
                variant="outlined"
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

              <div className="Tip__list">
                <RadioGroup>
                  {categoryLabels.map((_category) => (
                    <FormControlLabel
                      label={_category.label}
                      key={_category.label}
                      control={
                        <Radio
                          sx={{ color: _category.background }}
                          checked={category === _category.label}
                          name="category"
                          value={_category.label}
                          onChange={(event) =>
                            this.setState({ category: event.target.value })
                          }
                        />
                      }
                    />
                  ))}
                </RadioGroup>
              </div>
            </div>
            <Button type="submit" variant="outlined"  fullWidth size="small" >
              Save
            </Button>
          </Box>
        )}
      </div>
    );
  }
}



export default Tip;
