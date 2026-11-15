const bcrypt = require('bcrypt');
const { query } = require('../../packages/db/src/client.ts');
// Test setup provisions existing local accounts; public registration is intentionally absent.
module.exports = function seedAccount(db, username, role = 'user', nickname = username) {
  const id = Number(
    query(db, 'INSERT INTO users(username,nickname,password_hash,role) VALUES(?,?,?,?)').run(
      username,
      nickname,
      bcrypt.hashSync('CampusTest2026', 4),
      role,
    ).lastInsertRowid,
  );
  query(db, 'UPDATE users SET display_id=? WHERE id=?').run(String(id), id);
  return { id, username, nickname, role };
};
