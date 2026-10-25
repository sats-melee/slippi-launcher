import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import { ArenaPageMessages as Messages } from "./arena_page.messages";

export const AboutDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="sm"
    fullWidth={true}
    PaperProps={{ sx: { backgroundImage: "none" } }}
    aria-labelledby="about-title"
  >
    <DialogTitle id="about-title">{Messages.aboutTitle()}</DialogTitle>
    <DialogContent>
      <Typography paragraph={true}>{Messages.aboutDescription()}</Typography>
      <Typography color="text.secondary" paragraph={true}>
        {Messages.aboutRules()}
      </Typography>
      <div>
        <Typography fontWeight={700} gutterBottom={true}>
          {Messages.betaTitle()}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {Messages.betaDisclaimer()}
        </Typography>
      </div>
    </DialogContent>
    <DialogActions sx={{ padding: "12px 24px 20px" }}>
      <Button onClick={onClose} variant="outlined">
        {Messages.close()}
      </Button>
    </DialogActions>
  </Dialog>
);
