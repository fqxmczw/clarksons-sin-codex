import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/clarksons-sin/scripts/preferences.py"


class PreferencesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = {**os.environ, "CODEX_HOME": self.temp.name}
        self.path = Path(self.temp.name) / "clarksons-sin/preferences.json"

    def run_helper(self, *args, success=True):
        result = subprocess.run([sys.executable, str(SCRIPT), *args],
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        return json.loads(result.stdout)

    def test_first_use_is_read_only(self):
        self.assertTrue(self.run_helper("status")["onboardingRequired"])
        self.assertFalse(self.path.exists())

    def test_account_choice_survives_new_process_without_auth_claim(self):
        self.run_helper("choose", "account")
        state = self.run_helper("status")
        self.assertFalse(state["onboardingRequired"])
        self.assertEqual(state["mode"], "account")
        self.assertEqual(json.loads(self.path.read_text()), {"version": 1, "mode": "account"})

    def test_switch_and_reset(self):
        self.run_helper("choose", "public")
        self.assertEqual(self.run_helper("status")["mode"], "public")
        self.run_helper("choose", "account")
        self.assertTrue(self.run_helper("reset")["onboardingRequired"])

    def test_corrupt_file_is_not_silently_replaced(self):
        self.path.parent.mkdir()
        self.path.write_text("broken")
        self.assertFalse(self.run_helper("status", success=False)["ok"])
        self.run_helper("choose", "account", success=False)
        self.assertEqual(self.path.read_text(), "broken")

    def test_unknown_fields_fail_closed(self):
        self.path.parent.mkdir()
        self.path.write_text(json.dumps({"version": 1, "mode": "account", "authenticated": True}))
        self.run_helper("status", success=False)


if __name__ == "__main__":
    unittest.main()
