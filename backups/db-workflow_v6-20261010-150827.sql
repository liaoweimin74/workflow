/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.6-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: workflow_v6
-- ------------------------------------------------------
-- Server version	11.8.6-MariaDB-0+deb13u1 from Debian

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `workflow_v6`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `workflow_v6` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;

USE `workflow_v6`;

--
-- Table structure for table `flyway_schema_history`
--

DROP TABLE IF EXISTS `flyway_schema_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flyway_schema_history` (
  `installed_rank` int(11) NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int(11) DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT current_timestamp(),
  `execution_time` int(11) NOT NULL,
  `success` tinyint(1) NOT NULL,
  PRIMARY KEY (`installed_rank`),
  KEY `flyway_schema_history_s_idx` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flyway_schema_history`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flyway_schema_history` WRITE;
/*!40000 ALTER TABLE `flyway_schema_history` DISABLE KEYS */;
INSERT INTO `flyway_schema_history` VALUES
(1,'1','baseline schema','SQL','V1__baseline_schema.sql',650178947,'node-migrator','2026-09-23 14:47:09',8,1),
(2,'2','init data','SQL','V2__init_data.sql',1139911049,'node-migrator','2026-09-23 14:47:09',5,1),
(3,'3','grant admin menus','SQL','V3__grant_admin_menus.sql',810571147,'node-migrator','2026-09-23 14:47:09',2,1),
(4,'4','create wf node config','SQL','V4__create_wf_node_config.sql',1634819904,'node-migrator','2026-09-23 14:47:09',1,1),
(5,'5','create wf category','SQL','V5__create_wf_category.sql',1723544693,'node-migrator','2026-09-23 14:47:09',7,1),
(6,'6','create wf process draft','SQL','V6__create_wf_process_draft.sql',664068881,'node-migrator','2026-09-23 14:47:09',1,1),
(7,'7','add process management menus','SQL','V7__add_process_management_menus.sql',1190223043,'node-migrator','2026-09-23 14:47:09',2,1),
(8,'8','add last deployed at','SQL','V8__add_last_deployed_at.sql',1003492481,'node-migrator','2026-09-23 14:47:09',4,1),
(9,'9','fix version and deployed at','SQL','V9__fix_version_and_deployed_at.sql',717164960,'node-migrator','2026-09-23 14:47:09',0,1),
(10,'11','add category menu','SQL','V11__add_category_menu.sql',840182847,'node-migrator','2026-09-23 14:47:09',0,1),
(11,'12','create form tables','SQL','V12__create_form_tables.sql',-1358903684,'node-migrator','2026-09-23 14:47:09',3,1),
(12,'13','create wf task comment','SQL','V13__create_wf_task_comment.sql',-112966394,'node-migrator','2026-09-23 14:47:09',1,1),
(13,'14','create wf task transfer','SQL','V14__create_wf_task_transfer.sql',726975210,'node-migrator','2026-09-23 14:47:09',1,1),
(14,'15','add process category permissions','SQL','V15__add_process_category_permissions.sql',894892465,'node-migrator','2026-09-23 14:47:09',1,1),
(15,'16','create wf task remind','SQL','V16__create_wf_task_remind.sql',1528080298,'node-migrator','2026-09-23 14:47:09',3,1),
(16,'17','clear form def data','SQL','V17__clear_form_def_data.sql',-1322388170,'node-migrator','2026-09-23 14:47:09',2,1),
(17,'18','add deployed config hash','SQL','V18__add_deployed_config_hash.sql',430291177,'node-migrator','2026-09-23 14:47:09',2,1),
(18,'19','form def add type and column config','SQL','V19__form_def_add_type_and_column_config.sql',-76474991,'node-migrator','2026-09-23 14:47:09',5,1),
(19,'20','create wf page def','SQL','V20__create_wf_page_def.sql',333882923,'node-migrator','2026-09-23 14:47:09',3,1),
(20,'21','merge form view menus','SQL','V21__merge_form_view_menus.sql',-522814584,'node-migrator','2026-09-23 14:47:09',21,1),
(21,'22','add form id to data source','SQL','V22__add_form_id_to_data_source.sql',-1008722349,'node-migrator','2026-09-23 14:47:09',13,1),
(22,'23','add page data source id','SQL','V23__add_page_data_source_id.sql',-492092031,'node-migrator','2026-09-23 14:47:09',5,1),
(23,'24','create notification tables','SQL','V24__create_notification_tables.sql',1442754333,'node-migrator','2026-09-23 14:47:09',7,1),
(24,'25','optimize retry index','SQL','V25__optimize_retry_index.sql',629559468,'node-migrator','2026-09-23 14:47:09',2,1),
(25,'26','add notification menus','SQL','V26__add_notification_menus.sql',2047030466,'node-migrator','2026-09-23 14:47:09',2,1),
(26,'27','unify notification tenant type','SQL','V27__unify_notification_tenant_type.sql',1390673949,'node-migrator','2026-09-23 14:47:09',14,1),
(27,'28','add message content type','SQL','V28__add_message_content_type.sql',-2141586872,'node-migrator','2026-09-23 14:47:09',9,1),
(28,'29','add notification event definitions','SQL','V29__add_notification_event_definitions.sql',-103859050,'node-migrator','2026-09-23 14:47:09',61,1),
(29,'30','add form def process key','SQL','V30__add_form_def_process_key.sql',2118263784,'node-migrator','2026-09-23 14:47:09',3,1),
(30,'31','add source key unique','SQL','V31__add_source_key_unique.sql',-996958868,'node-migrator','2026-09-23 14:47:09',3,1),
(31,'32','create engine runtime tables','SQL','V32__create_engine_runtime_tables.sql',-2026819748,'node-migrator','2026-09-23 14:47:09',11,1),
(32,'33','add process def target namespace','SQL','V33__add_process_def_target_namespace.sql',-232587996,'node-migrator','2026-09-23 14:47:09',3,1),
(33,'34','wfe timestamps microsecond','SQL','V34__wfe_timestamps_microsecond.sql',1761348934,'node-migrator','2026-09-23 14:47:09',17,1),
(34,'35','align hibernate added schema','SQL','V35__align_hibernate_added_schema.sql',-485857535,'node-migrator','2026-09-23 14:47:09',53,1),
(35,'36','create task delegation','SQL','V36__create_task_delegation.sql',607377456,'node-migrator','2026-09-23 14:47:09',2,1),
(36,'37','add instance lock version','SQL','V37__add_instance_lock_version.sql',-1909082123,'node-migrator','2026-09-23 14:47:09',1,1),
(37,'38','fix node config unique key','SQL','V38__fix_node_config_unique_key.sql',-44417256,'node-migrator','2026-09-23 14:47:09',5,1),
(38,'39','builtin data sources','SQL','V39__builtin_data_sources.sql',-473665810,'node-migrator','2026-09-24 09:09:15',14,1),
(39,'40','create engine notify','SQL','V40__create_engine_notify.sql',-61291012,'node-migrator','2026-09-27 10:43:07',2,1),
(40,'41','add task comment signature','SQL','V41__add_task_comment_signature.sql',-1623754221,'node-migrator','2026-09-27 15:59:50',29,1);
/*!40000 ALTER TABLE `flyway_schema_history` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_channel_config`
--

DROP TABLE IF EXISTS `msg_channel_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_channel_config` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL COMMENT '渠道类型',
  `config_key` varchar(64) NOT NULL COMMENT '配置键；__enabled 为保留键（渠道启停开关）',
  `config_value` text DEFAULT NULL COMMENT '配置值；is_encrypted=1 时为密文',
  `is_encrypted` bit(1) NOT NULL DEFAULT b'0' COMMENT '值是否加密存储',
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_config` (`channel`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='渠道运行时配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_channel_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_channel_config` WRITE;
/*!40000 ALTER TABLE `msg_channel_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_channel_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_delivery_retry`
--

DROP TABLE IF EXISTS `msg_delivery_retry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_delivery_retry` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `recipient_id` bigint(20) NOT NULL COMMENT '收件人ID',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `retry_count` int(11) NOT NULL DEFAULT 0 COMMENT '重试次数',
  `max_retry` int(11) NOT NULL DEFAULT 3 COMMENT '最大重试次数',
  `last_error` text DEFAULT NULL COMMENT '最后一次错误',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间',
  `status` varchar(16) NOT NULL COMMENT '状态',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `message_id` bigint(20) NOT NULL DEFAULT 0 COMMENT '消息ID（重试时据此重建内容）',
  PRIMARY KEY (`id`),
  KEY `idx_recipient` (`recipient_id`),
  KEY `idx_next_retry` (`next_retry_at`),
  KEY `idx_retry_status_next` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息路由失败重试记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_delivery_retry`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_delivery_retry` WRITE;
/*!40000 ALTER TABLE `msg_delivery_retry` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_delivery_retry` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_event_definition`
--

DROP TABLE IF EXISTS `msg_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_event_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `event_code` varchar(64) NOT NULL COMMENT '业务事件代码',
  `event_name` varchar(128) NOT NULL COMMENT '事件名称',
  `description` varchar(500) DEFAULT NULL COMMENT '事件说明',
  `business_domain` varchar(64) DEFAULT NULL COMMENT '业务领域',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_by` varchar(64) NOT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_by` varchar(64) DEFAULT NULL COMMENT '更新人',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_tenant_code` (`tenant_id`,`event_code`),
  KEY `idx_event_tenant_enabled` (`tenant_id`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息业务事件定义';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_event_definition` WRITE;
/*!40000 ALTER TABLE `msg_event_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_message`
--

DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_message` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `template_code` varchar(64) NOT NULL COMMENT '模板代码',
  `sender_id` bigint(20) NOT NULL COMMENT '发送者ID',
  `sender_type` varchar(32) NOT NULL COMMENT '发送者类型 (SYSTEM, USER)',
  `title` varchar(255) NOT NULL COMMENT '消息标题',
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '消息内容 (JSON)' CHECK (json_valid(`content`)),
  `link_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '链接信息 (JSON)' CHECK (json_valid(`link_json`)),
  `priority` varchar(16) NOT NULL COMMENT '消息优先级',
  `category` varchar(16) NOT NULL COMMENT '消息类别',
  `message_type` varchar(16) NOT NULL COMMENT '消息类型',
  `content_type` enum('TEXT','MARKDOWN') DEFAULT NULL COMMENT '内容渲染类型 (TEXT/MARKDOWN)',
  `status` varchar(16) NOT NULL COMMENT '消息状态',
  `created_at` datetime DEFAULT current_timestamp(),
  `event_code` varchar(64) DEFAULT NULL COMMENT '业务事件代码',
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_template` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_message`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_message` WRITE;
/*!40000 ALTER TABLE `msg_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_message` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_recipient`
--

DROP TABLE IF EXISTS `msg_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_recipient` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `message_id` bigint(20) NOT NULL COMMENT '消息ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `username` varchar(64) NOT NULL COMMENT '用户名',
  `nickname` varchar(64) DEFAULT NULL COMMENT '昵称',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `status` varchar(16) NOT NULL COMMENT '消息状态',
  `sent_at` datetime DEFAULT NULL COMMENT '发送时间',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message` (`message_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收件人表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_recipient`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_recipient` WRITE;
/*!40000 ALTER TABLE `msg_recipient` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_recipient` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_subscription_rule`
--

DROP TABLE IF EXISTS `msg_subscription_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_subscription_rule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `event_code` varchar(64) NOT NULL COMMENT '事件代码',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `priority` varchar(16) DEFAULT NULL COMMENT '优先级',
  `enable` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `condition_expr` text DEFAULT NULL COMMENT '条件表达式',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT current_timestamp(),
  `action` varchar(16) NOT NULL DEFAULT 'ALLOW' COMMENT '规则动作',
  PRIMARY KEY (`id`),
  KEY `idx_event_channel` (`event_code`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅规则表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_subscription_rule`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_subscription_rule` WRITE;
/*!40000 ALTER TABLE `msg_subscription_rule` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_subscription_rule` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_template`
--

DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_template` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `template_code` varchar(64) NOT NULL COMMENT '模板代码',
  `name` varchar(128) NOT NULL COMMENT '模板名称',
  `title` varchar(255) DEFAULT NULL COMMENT '标题模板',
  `content` text DEFAULT NULL COMMENT '内容模板',
  `channel` varchar(16) DEFAULT NULL COMMENT '渠道类型',
  `priority` varchar(16) DEFAULT NULL COMMENT '默认优先级',
  `category` varchar(16) DEFAULT NULL COMMENT '默认类别',
  `is_system` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为系统模板',
  `created_at` datetime DEFAULT current_timestamp(),
  `event_code` varchar(64) DEFAULT NULL COMMENT '业务事件代码',
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL COMMENT '内容渲染类型（TEXT/MARKDOWN）',
  `enabled` bit(1) NOT NULL DEFAULT b'1' COMMENT '是否启用（停用后发送被拒绝）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_template` (`tenant_id`,`template_code`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_template`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_template` WRITE;
/*!40000 ALTER TABLE `msg_template` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_template` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_user_subscription`
--

DROP TABLE IF EXISTS `msg_user_subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_user_subscription` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `username` varchar(64) NOT NULL COMMENT '用户名',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `subscribed` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否订阅',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user_channel` (`tenant_id`,`user_id`,`channel`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_user_subscription`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_user_subscription` WRITE;
/*!40000 ALTER TABLE `msg_user_subscription` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_user_subscription` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `value` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `dict_name` varchar(100) NOT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn09exsucyqm2v79fwvep1wtn9` (`dict_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `menu_name` varchar(100) NOT NULL,
  `menu_type` int(11) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `path` varchar(200) DEFAULT NULL,
  `permission` varchar(100) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=265 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES
(1,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,'Setting','系统管理',0,NULL,'/system',NULL,1,1),
(2,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/user/index','User','用户管理',1,1,'/system/user','system:user:list',1,1),
(3,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/role/index','UserFilled','角色管理',1,1,'/system/role','system:role:list',2,1),
(4,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/menu/index','Menu','菜单管理',1,1,'/system/menu','system:menu:list',3,1),
(5,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/org/index','Organization','组织机构',1,1,'/system/org','system:org:list',4,1),
(6,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/dict/index','List','字典管理',1,1,'/system/dict','system:dict:list',5,1),
(7,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'dashboard/index','HomeFilled','首页',1,NULL,'/dashboard',NULL,0,1),
(8,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户查询',2,2,NULL,'system:user:query',1,1),
(9,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户新增',2,2,NULL,'system:user:create',2,1),
(10,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户修改',2,2,NULL,'system:user:update',3,1),
(11,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户删除',2,2,NULL,'system:user:delete',4,1),
(12,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色查询',2,3,NULL,'system:role:query',1,1),
(13,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色新增',2,3,NULL,'system:role:create',2,1),
(14,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色修改',2,3,NULL,'system:role:update',3,1),
(15,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色删除',2,3,NULL,'system:role:delete',4,1),
(16,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单查询',2,4,NULL,'system:menu:query',1,1),
(17,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单新增',2,4,NULL,'system:menu:create',2,1),
(18,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单修改',2,4,NULL,'system:menu:update',3,1),
(19,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单删除',2,4,NULL,'system:menu:delete',4,1),
(20,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构查询',2,5,NULL,'system:org:query',1,1),
(21,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构新增',2,5,NULL,'system:org:create',2,1),
(22,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构修改',2,5,NULL,'system:org:update',3,1),
(23,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构删除',2,5,NULL,'system:org:delete',4,1),
(24,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典查询',2,6,NULL,'system:dict:query',1,1),
(25,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典新增',2,6,NULL,'system:dict:create',2,1),
(26,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典修改',2,6,NULL,'system:dict:update',3,1),
(27,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典删除',2,6,NULL,'system:dict:delete',4,1),
(100,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,'Operation','流程管理',0,NULL,'/process',NULL,2,1),
(101,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessListPage','Document','流程定义',1,100,'/process/definition','process:definition:list',1,1),
(102,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessCenterPage','Files','流程中心',1,100,'/process/center','process:center:list',2,1),
(103,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessTodoPage','BellFilled','待办处理',1,100,'/process/todo','process:todo:list',3,1),
(110,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程创建',2,101,NULL,'process:definition:create',1,1),
(111,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程部署',2,101,NULL,'process:definition:deploy',2,1),
(112,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程删除',2,101,NULL,'process:definition:delete',3,1),
(113,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类创建',2,104,NULL,'process:category:create',1,1),
(114,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类编辑',2,104,NULL,'process:category:update',2,1),
(115,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类删除',2,104,NULL,'process:category:delete',3,1),
(120,'2026-09-23 14:47:09.000000',NULL,1,'2026-09-23 14:47:09.000000',NULL,NULL,'Tickets','表单管理',0,NULL,'/form',NULL,3,0),
(121,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'form/FormListPage','Document','表单列表',1,160,'/form','form:list',1,1),
(130,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单创建',2,121,NULL,'form:create',1,1),
(131,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单编辑',2,121,NULL,'form:edit',2,1),
(132,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单发布',2,121,NULL,'form:publish',3,1),
(133,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单删除',2,121,NULL,'form:delete',4,1),
(140,'2026-09-23 14:47:09.000000',NULL,1,'2026-09-23 14:47:09.000000',NULL,NULL,'Grid','查询界面管理',0,NULL,'/page',NULL,4,0),
(141,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'page/PageListPage','Document','页面列表',1,160,'/page','page:list',1,1),
(142,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'dataSource/DataSourceListPage','Connection','数据源管理',1,160,'/data-source/list','data-source:list',2,1),
(150,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面创建',2,141,NULL,'page:create',1,1),
(151,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面编辑',2,141,NULL,'page:edit',2,1),
(152,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面发布',2,141,NULL,'page:publish',3,1),
(153,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面删除',2,141,NULL,'page:delete',4,1),
(154,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'数据源管理',2,142,NULL,'data-source:manage',1,1),
(160,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'Grid','表单视图管理',0,NULL,'/form',NULL,3,1),
(250,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'Bell','消息管理',0,NULL,'/messages',NULL,5,1),
(251,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/MessageCenter','Message','消息中心',1,250,'/messages','notification:message:list',1,1),
(252,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/TemplateList','Document','模板管理',1,250,'/messages/templates','notification:template:list',2,1),
(253,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/ChannelConfig','Connection','渠道配置',1,250,'/messages/channels','notification:channel:list',3,1),
(254,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/SubscriptionRules','SetUp','订阅规则',1,250,'/messages/subscriptions','notification:subscription:list',4,1),
(255,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/DeliveryLog','Tickets','发送记录',1,250,'/messages/deliveries','notification:delivery:list',5,1),
(256,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'模板管理',2,252,NULL,'notification:template:manage',1,1),
(257,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'渠道配置',2,253,NULL,'notification:channel:manage',1,1),
(258,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'订阅规则',2,254,NULL,'notification:subscription:manage',1,1),
(259,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'发送记录重发',2,255,NULL,'notification:delivery:retry',1,1),
(260,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/AnnouncementList','Notification','公告管理',1,250,'/messages/announcements','notification:announcement:list',6,1),
(261,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/EventDefinitionList','Operation','事件管理',1,250,'/messages/events','notification:event:list',7,1),
(262,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'公告管理',2,260,NULL,'notification:announcement:manage',1,1),
(263,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'事件管理',2,261,NULL,'notification:event:manage',1,1),
(264,'2026-09-25 10:31:10.775000',NULL,0,'2026-09-25 10:31:10.775000',NULL,'page/PageRenderer',NULL,'演示页面1',1,160,'/page/test1','page:read:test1',0,1);
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_organization`
--

DROP TABLE IF EXISTS `sys_organization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_organization` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `org_code` varchar(50) NOT NULL,
  `org_name` varchar(100) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK1dm1ss9gn66mtn1m0dyb9bsyp` (`org_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_organization`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_organization` WRITE;
/*!40000 ALTER TABLE `sys_organization` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_organization` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `role_code` varchar(50) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjqdita2l45v2gglry7bp8kl1f` (`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES
(1,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'系统超级管理员','ROLE_ADMIN','超级管理员',1),
(2,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'系统普通用户','ROLE_USER','普通用户',1);
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `menu_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES
(1,1,1),
(2,2,1),
(3,3,1),
(4,4,1),
(5,5,1),
(6,6,1),
(7,7,1),
(8,8,1),
(9,9,1),
(10,10,1),
(11,11,1),
(12,12,1),
(13,13,1),
(14,14,1),
(15,15,1),
(16,16,1),
(17,17,1),
(18,18,1),
(19,19,1),
(20,20,1),
(21,21,1),
(22,22,1),
(23,23,1),
(24,24,1),
(25,25,1),
(26,26,1),
(27,27,1),
(32,100,1),
(33,101,1),
(34,102,1),
(35,103,1),
(36,110,1),
(37,111,1),
(38,112,1),
(39,120,1),
(40,121,1),
(41,130,1),
(42,131,1),
(43,132,1),
(44,133,1),
(46,113,1),
(47,114,1),
(48,115,1),
(49,140,1),
(50,141,1),
(51,142,1),
(52,150,1),
(53,151,1),
(54,152,1),
(55,153,1),
(56,154,1),
(64,160,1),
(65,250,1),
(66,251,1),
(67,252,1),
(68,253,1),
(69,254,1),
(70,255,1),
(71,256,1),
(72,257,1),
(73,258,1),
(74,259,1),
(80,260,1),
(81,261,1),
(82,262,1),
(83,263,1),
(84,264,1);
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `org_id` bigint(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK51bvuyvihefoh4kp5syh2jpi4` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-10-10 15:08:27
