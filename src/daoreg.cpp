#include <daoreg.hpp>

ACTION daoreg::reset() {

  require_auth(get_self());

  dao_table _dao(get_self(), get_self().value);

  auto daoit = _dao.begin();
  while (daoit != _dao.end()) {
    daoit = _dao.erase(daoit);
  }

}

// nombre de la organizacion, cuenta que la creo y hash de ipfs

ACTION daoreg::create(const name& dao, const name& creator, const std::string& ipfs) {

  require_auth(get_self());
  // check valid ipfs ?

  dao_table _dao(get_self(), get_self().value);
  _dao.emplace(get_self(), [&](auto& new_org){
    new_org.dao = dao;
    new_org.creator = creator;
    new_org.ipfs = ipfs;
  });

}

ACTION daoreg::update(const name& dao, const std::string& ipfs) {

  // same validations as in create

  dao_table _dao(get_self(), get_self().value);

  auto daoit = _dao.find( dao.value );
  check( daoit != _dao.end(), "Organization not found" );

  require_auth( daoit->creator );

  _dao.modify(daoit, _self, [&](auto& org){
    org.dao = dao;
    org.ipfs = ipfs;
  });

}

ACTION daoreg::delorg(const name& dao) {

  dao_table _dao(get_self(), get_self().value);

  auto daoit = _dao.find( dao.value );
  check( daoit != _dao.end(), "Organization not found" );

  require_auth( daoit->creator );

  _dao.erase(daoit);

}