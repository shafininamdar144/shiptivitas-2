import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

// CORS - allows frontend running on localhost:3000
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.get('/', (req, res) => {
  return res.status(200).send({
    message: 'SHIPTIVITY API. Read documentation to see API docs'
  });
});

// Keep one database connection alive
const db = new Database('./clients.db');

// Close database when server terminates
const closeDb = () => db.close();

process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

// Validate client ID
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid id provided.',
        long_message: 'Id can only be integer.'
      }
    };
  }

  const client = db
    .prepare('SELECT * FROM clients WHERE id = ? LIMIT 1')
    .get(id);

  if (!client) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid id provided.',
        long_message: 'Cannot find client with that id.'
      }
    };
  }

  return {
    valid: true
  };
};

// Validate priority
const validatePriority = (priority) => {
  if (Number.isNaN(priority) || priority < 1) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid priority provided.',
        long_message: 'Priority can only be positive integer.'
      }
    };
  }

  return {
    valid: true
  };
};

// GET all clients
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;

  if (status) {
    if (
      status !== 'backlog' &&
      status !== 'in-progress' &&
      status !== 'complete'
    ) {
      return res.status(400).send({
        message: 'Invalid status provided.',
        long_message:
          'Status can only be one of the following: [backlog | in-progress | complete].'
      });
    }

    const clients = db
      .prepare('SELECT * FROM clients WHERE status = ? ORDER BY priority ASC')
      .all(status);

    return res.status(200).send(clients);
  }

  const clients = db
    .prepare('SELECT * FROM clients ORDER BY status, priority ASC')
    .all();

  return res.status(200).send(clients);
});

// GET one client
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);

  if (!valid) {
    return res.status(400).send(messageObj);
  }

  const client = db
    .prepare('SELECT * FROM clients WHERE id = ?')
    .get(id);

  return res.status(200).send(client);
});

// PUT - update client status and priority
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);

  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;

  const client = db
    .prepare('SELECT * FROM clients WHERE id = ?')
    .get(id);

  const oldStatus = client.status;
  const oldPriority = client.priority;

  // Validate status
  if (
    status !== undefined &&
    status !== 'backlog' &&
    status !== 'in-progress' &&
    status !== 'complete'
  ) {
    return res.status(400).send({
      message: 'Invalid status provided.',
      long_message:
        'Status can only be one of the following: [backlog | in-progress | complete].'
    });
  }

  // Validate priority
  if (priority !== undefined) {
    priority = parseInt(priority, 10);

    const priorityValidation = validatePriority(priority);

    if (!priorityValidation.valid) {
      return res.status(400).send(priorityValidation.messageObj);
    }
  }

  const newStatus = status || oldStatus;

  // If priority is not provided, place the card at the bottom
  if (priority === undefined) {
    const result = db
      .prepare(
        'SELECT MAX(priority) AS maxPriority FROM clients WHERE status = ?'
      )
      .get(newStatus);

    priority = (result.maxPriority || 0) + 1;
  }

  const updateClient = db.transaction(() => {
    // Remove client from old position
    db.prepare(
      `UPDATE clients
       SET priority = priority - 1
       WHERE status = ? AND priority > ?`
    ).run(oldStatus, oldPriority);

    // Make space at the new position
    db.prepare(
      `UPDATE clients
       SET priority = priority + 1
       WHERE status = ? AND priority >= ?`
    ).run(newStatus, priority);

    // Update client
    db.prepare(
      `UPDATE clients
       SET status = ?, priority = ?
       WHERE id = ?`
    ).run(newStatus, priority, id);
  });

  updateClient();

  // Return updated clients
  const clients = db
    .prepare('SELECT * FROM clients ORDER BY status, priority ASC')
    .all();

  return res.status(200).send(clients);
});

app.listen(3001, () => {
  console.log('app running on port 3001');
});