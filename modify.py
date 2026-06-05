import re

with open('content/x_scraper.js', 'r') as f:
    lines = f.readlines()

def remove_lines(start_idx, end_idx):
    for i in range(start_idx, end_idx):
        lines[i] = ''

# Remove constants
# const SEARCH_DISCOVERY_LOOKBACK_DAYS = 7;
# const DEFAULT_INTERACTION_TARGETS = { ... }
# const PROJECT_ACCOUNT_HANDLES = new Set([ ... ])
# const DEFAULT_DISCOVERY_KEYWORDS_ZH = { ... }
# const DEFAULT_DISCOVERY_KEYWORDS_EN = { ... }

remove_lines(41, 68)

# remove functions 476 to 844
remove_lines(475, 844)

# metric functions
remove_lines(861, 889)
remove_lines(904, 923)
remove_lines(935, 944)

with open('content/x_scraper.js', 'w') as f:
    f.writelines(lines)
