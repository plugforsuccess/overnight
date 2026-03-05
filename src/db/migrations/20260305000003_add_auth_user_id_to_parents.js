exports.up = function (knex) {
  return knex.schema.alterTable('parents', (t) => {
    t.uuid('auth_user_id').unique();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('parents', (t) => {
    t.dropColumn('auth_user_id');
  });
};
