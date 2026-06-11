export async function createGist(token, contentObj) {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: "VibeX Auto-Sync Configuration",
      public: false,
      files: {
        "vibex_sync.json": {
          content: JSON.stringify(contentObj, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gist API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id, updatedAt: new Date(data.updated_at).getTime() };
}

export async function updateGist(token, gistId, contentObj) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        "vibex_sync.json": {
          content: JSON.stringify(contentObj, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gist API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id, updatedAt: new Date(data.updated_at).getTime() };
}

export async function fetchGist(token, gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Gist API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const file = data.files['vibex_sync.json'];
  if (!file) {
    throw new Error('vibex_sync.json not found in Gist');
  }

  return {
    content: JSON.parse(file.content),
    updatedAt: new Date(data.updated_at).getTime()
  };
}

export async function findExistingVibeXGist(token) {
  const response = await fetch('https://api.github.com/gists', {
    method: 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) return null;

  const gists = await response.json();
  const vibeXGist = gists.find(gist => gist.description === "VibeX Auto-Sync Configuration" && gist.files['vibex_sync.json']);
  return vibeXGist ? vibeXGist.id : null;
}
